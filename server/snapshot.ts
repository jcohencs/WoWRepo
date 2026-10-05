import type { ApiStatus, Comparison, Raid, ZoneReport } from '../shared/types.js';
import { DAY, HOUR, MINUTE, type TtlCache } from './cache.js';
import type { CharacterRef } from './core/input.js';
import { raidsFromZones } from './core/raids.js';
import { TBC_ZONES } from './core/zones.js';
import { ApiFailure, PendingPull } from './errors.js';
import type { Provider } from './provider.js';
import type { WclProvider } from './wcl/provider.js';

/**
 * The site works in two halves that share one saved store:
 *
 * - `SnapshotProvider` answers visitors. It only reads finished, saved pages and never calls
 *   Warcraft Logs. Anything not saved yet is put in a queue.
 * - `Puller` runs on a timer. It works through the queue, then re-pulls the oldest saved pages,
 *   for as long as this hour's allowance lasts.
 */

type Job =
  | { kind: 'zone'; ref: CharacterRef; raidId: string }
  | { kind: 'compare'; ref: CharacterRef; encounterId: number; spec: string };

interface SavedPage {
  job: Job;
  lastViewed: number;
}

/** Re-pull saved pages once they are this old. */
const REFRESH_AFTER = { zone: 2 * HOUR, compare: 12 * HOUR };
/** Stop re-pulling pages nobody has opened for this long. */
const FORGET_AFTER = 14 * DAY;
/** How long a "character not found" answer is remembered. */
const NOT_FOUND_TTL = 6 * HOUR;
/** Keep this much of the hourly allowance unspent by refreshes, so queued lookups can still run. */
const REFRESH_RESERVE = 0.15;
const KEEP = 365 * DAY;

const refKey = (r: CharacterRef) => `${r.region}|${r.realm}|${r.name}`;
export const jobKey = (j: Job) =>
  j.kind === 'zone' ? `zone|${refKey(j.ref)}|${j.raidId}` : `compare|${refKey(j.ref)}|${j.encounterId}|${j.spec}`;

export class Puller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private nextRunAt = Date.now();

  constructor(
    private readonly live: WclProvider,
    private readonly cache: TtlCache,
    readonly intervalMs = 10 * MINUTE,
  ) {}

  start(): void {
    if (this.timer) return;
    this.nextRunAt = Date.now() + 5_000;
    setTimeout(() => void this.run(), 5_000).unref?.();
    this.timer = setInterval(() => void this.run(), this.intervalMs);
    this.timer.unref?.();
  }

  secondsUntilNextRun(): number {
    return Math.max(0, Math.round((this.nextRunAt - Date.now()) / 1000));
  }

  queue(): Job[] {
    return this.cache.peekAny<Job[]>('queue')?.value ?? [];
  }

  /** Adds a job (once) and returns its 1-based place in line. */
  enqueue(job: Job): number {
    const q = this.queue();
    const key = jobKey(job);
    const at = q.findIndex((j) => jobKey(j) === key);
    if (at >= 0) return at + 1;
    q.push(job);
    this.cache.set('queue', q, KEEP);
    return q.length;
  }

  /** One scheduled pass. Overlapping calls share the same pass. */
  run(): Promise<void> {
    if (!this.running) {
      this.nextRunAt = Date.now() + this.intervalMs;
      this.running = this.pass().finally(() => {
        this.running = null;
        this.cache.flush();
      });
    }
    return this.running;
  }

  private async pass(): Promise<void> {
    await this.live.raids().catch(() => undefined); // keeps the raid list current (cached a week)

    // 1. Things visitors asked for that aren't saved yet, oldest request first.
    while (this.queue().length) {
      const job = this.queue()[0];
      const outcome = await this.pull(job);
      if (outcome === 'limited') return;
      this.cache.set('queue', this.queue().filter((j) => jobKey(j) !== jobKey(job)), KEEP);
    }

    // 2. Re-pull saved pages, stalest first, keeping some allowance back.
    const pages = this.cache.peekAny<Record<string, SavedPage>>('pages')?.value ?? {};
    const now = Date.now();
    const due: { page: SavedPage; at: number }[] = [];
    for (const [key, page] of Object.entries(pages)) {
      if (now - page.lastViewed > FORGET_AFTER) {
        delete pages[key];
        continue;
      }
      const at = this.cache.fetchedAt(`view|${key}`) ?? 0;
      if (now - at > REFRESH_AFTER[page.job.kind]) due.push({ page, at });
    }
    this.cache.set('pages', pages, KEEP);
    due.sort((a, b) => a.at - b.at);
    for (const { page } of due) {
      if (this.live.headroom() <= REFRESH_RESERVE) return;
      if ((await this.pull(page.job)) === 'limited') return;
    }
  }

  private async pull(job: Job): Promise<'ok' | 'limited' | 'failed'> {
    const key = jobKey(job);
    try {
      const page =
        job.kind === 'zone' ? await this.live.zoneReport(job.ref, job.raidId) : await this.live.compare(job.ref, job.encounterId, job.spec);
      this.cache.set(`view|${key}`, page, KEEP);
      this.cache.set(`notfound|${key}`, null, -1);
      return 'ok';
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'rate_limited') return 'limited';
      const message = err instanceof ApiFailure && err.code !== 'upstream' ? err.message : 'Warcraft Logs could not be reached for this one.';
      this.cache.set(`notfound|${key}`, { message, code: err instanceof ApiFailure ? err.code : 'upstream' }, NOT_FOUND_TTL);
      return 'failed';
    }
  }
}

export class SnapshotProvider implements Provider {
  readonly demo = false;

  constructor(
    private readonly live: WclProvider,
    private readonly cache: TtlCache,
    private readonly puller: Puller,
  ) {}

  get site() {
    return this.live.site;
  }

  async raids(): Promise<Raid[]> {
    const zones = this.cache.peekAny<typeof TBC_ZONES>('zones')?.value;
    return raidsFromZones(zones ?? TBC_ZONES);
  }

  status(): ApiStatus {
    return { ...this.live.status(), queued: this.puller.queue().length, nextUpdateInSec: this.puller.secondsUntilNextRun() };
  }

  async zoneReport(ref: CharacterRef, raidId?: string): Promise<ZoneReport> {
    const raids = await this.raids();
    const id = raidId ?? raids[raids.length - 1]?.id;
    if (!raids.some((r) => r.id === id)) throw new ApiFailure('not_found', `Unknown raid "${raidId}".`);
    return this.read<ZoneReport>({ kind: 'zone', ref, raidId: id! });
  }

  async compare(ref: CharacterRef, encounterId: number, spec: string): Promise<Comparison> {
    if (!/^[A-Za-z]+$/.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');
    return this.read<Comparison>({ kind: 'compare', ref, encounterId, spec });
  }

  private read<T>(job: Job): T {
    const key = jobKey(job);
    this.touch(key, job);
    const saved = this.cache.peekAny<T>(`view|${key}`);
    if (saved) return saved.value;
    const failed = this.cache.peek<{ message: string; code: ApiFailure['code'] } | null>(`notfound|${key}`);
    if (failed) throw new ApiFailure(failed.code, failed.message);
    throw new PendingPull(this.puller.enqueue(job), this.puller.secondsUntilNextRun());
  }

  /** Records that a page was opened, so the puller keeps it fresh. */
  private touch(key: string, job: Job) {
    const pages = this.cache.peekAny<Record<string, SavedPage>>('pages')?.value ?? {};
    pages[key] = { job, lastViewed: Date.now() };
    this.cache.set('pages', pages, KEEP);
  }
}
