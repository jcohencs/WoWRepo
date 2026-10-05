import { REALM_REGION, REALMS, type ApiStatus, type Comparison, type Metric, type Raid, type ZoneReport } from '../shared/types.js';
import { DAY, HOUR, MINUTE, type TtlCache } from './cache.js';
import { classByName } from './core/classes.js';
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
  | { kind: 'zone'; ref: CharacterRef; raidId: string; spec?: string }
  | { kind: 'compare'; ref: CharacterRef; encounterId: number; spec: string };

interface SavedPage {
  job: Job;
  lastViewed: number;
}

/** Re-pull saved pages people open once they are this old. */
const REFRESH_AFTER = { zone: 2 * HOUR, compare: 12 * HOUR };
/** Pages built by the realm-wide sweep are re-pulled daily. */
const SWEEP_REFRESH = DAY;
/** Who raids on each realm is re-discovered daily. */
const ROSTER_REFRESH = DAY;
/** Characters per request during the sweep. */
const SWEEP_BATCH = 10;
/** Ranking pages per request during roster discovery. */
const DISCOVERY_BATCH = 6;

interface DiscoveryTask {
  encounterId: number;
  metric: Metric;
  nextPage: number;
  done: boolean;
}

/** Everyone with a ranked raid kill on one realm, found from that realm's boss rankings. */
interface Roster {
  names: string[];
  /** When the last full discovery finished; 0 if never. */
  discoveredAt: number;
  /** Progress of the discovery in flight, if any. */
  tasks: DiscoveryTask[] | null;
}
/** Stop re-pulling pages nobody has opened for this long. */
const FORGET_AFTER = 14 * DAY;
/** How long a "character not found" answer is remembered. */
const NOT_FOUND_TTL = 6 * HOUR;
/** How long before an unexpected failure is retried. */
const RETRY_AFTER = 15 * MINUTE;
/** Keep this much of the hourly allowance unspent by refreshes, so queued lookups can still run. */
const REFRESH_RESERVE = 0.15;
/**
 * The realm-wide discovery and sweep only use the allowance while this much is left, so a share
 * of every hour stays free for visitors' lookups, refreshes and `npm run doctor`.
 */
const SWEEP_RESERVE = Number(process.env.SWEEP_RESERVE) || 0.4;
const KEEP = 365 * DAY;

const refKey = (r: CharacterRef) => `${r.region}|${r.realm}|${r.name}`;
export const jobKey = (j: Job) =>
  j.kind === 'zone'
    ? `zone|${refKey(j.ref)}|${j.raidId}${j.spec ? `|${j.spec}` : ''}`
    : `compare|${refKey(j.ref)}|${j.encounterId}|${j.spec}`;

export class Puller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private nextRunAt = Date.now();

  constructor(
    private readonly live: WclProvider,
    private readonly cache: TtlCache,
    readonly intervalMs = 10 * MINUTE,
    private readonly log = false,
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

  roster(realm: string): Roster {
    return this.cache.peekAny<Roster>(`roster|${REALM_REGION}|${realm}`)?.value ?? { names: [], discoveredAt: 0, tasks: null };
  }

  /** How far the realm-wide sweep has got, per realm. */
  progress(): { realm: string; characters: number; current: number }[] {
    return REALMS.map((r) => {
      const names = this.roster(r.slug).names;
      const raids = this.cachedRaids();
      const latest = raids[raids.length - 1];
      const current = latest
        ? names.filter((name) => {
            const at = this.cache.fetchedAt(`view|${jobKey({ kind: 'zone', ref: { region: REALM_REGION, realm: r.slug, name }, raidId: latest.id })}`);
            return at != null && Date.now() - at < SWEEP_REFRESH;
          }).length
        : 0;
      return { realm: r.name, characters: names.length, current };
    });
  }

  private cachedRaids(): Raid[] {
    return raidsFromZones(this.cache.peekAny<typeof TBC_ZONES>('zones-v2')?.value ?? TBC_ZONES);
  }

  /** One scheduled pass. Overlapping calls share the same pass. */
  run(): Promise<void> {
    if (!this.running) {
      this.nextRunAt = Date.now() + this.intervalMs;
      this.running = this.pass().finally(() => {
        this.running = null;
        this.cache.flush();
        if (this.log) {
          const p = this.progress().map((r) => `${r.realm} ${r.current}/${r.characters}`).join(', ');
          console.log(`[parsecheck] Pull finished. Up to date (latest raid): ${p}. Waiting: ${this.queue().length}.`);
        }
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

    // 3. Find who raids on each realm (re-checked daily).
    for (const realm of REALMS) if ((await this.discover(realm.slug)) === 'limited') return;

    // 4. Pull everyone on the realms, newest raid first.
    await this.sweep();
  }

  /** Works through the realm's boss rankings, a few pages per request, collecting raider names. */
  private async discover(realm: string): Promise<'ok' | 'limited'> {
    const key = `roster|${REALM_REGION}|${realm}`;
    const roster = this.roster(realm);
    if (!roster.tasks && Date.now() - roster.discoveredAt < ROSTER_REFRESH) return 'ok';
    if (!roster.tasks) {
      // The first boss of each raid sees the most kills, so it finds the most raiders.
      roster.tasks = this.cachedRaids().flatMap((r) =>
        r.encounters.length ? (['dps', 'hps'] as const).map((metric) => ({ encounterId: r.encounters[0].id, metric, nextPage: 1, done: false })) : [],
      );
    }
    const names = new Set(roster.names);
    while (roster.tasks.some((t) => !t.done)) {
      if (this.live.headroom() <= SWEEP_RESERVE) return 'limited';
      const batch = roster.tasks.filter((t) => !t.done).slice(0, DISCOVERY_BATCH);
      let pages;
      try {
        pages = await this.live.realmRankings(REALM_REGION, realm, batch.map((t) => ({ encounterId: t.encounterId, metric: t.metric, page: t.nextPage })));
      } catch (err) {
        if (err instanceof ApiFailure && err.code === 'rate_limited') return 'limited';
        console.error(`[parsecheck] Finding raiders on ${realm} failed: ${err instanceof Error ? err.message : err}`);
        batch.forEach((t) => (t.done = true)); // skip a boss Warcraft Logs won't rank rather than stall
        continue;
      }
      batch.forEach((t, i) => {
        pages[i].names.forEach((n) => names.add(n));
        if (pages[i].hasMore && t.nextPage < 200) t.nextPage++;
        else t.done = true;
      });
      roster.names = [...names].sort((a, b) => a.localeCompare(b));
      this.cache.set(key, roster, KEEP);
    }
    roster.tasks = null;
    roster.discoveredAt = Date.now();
    this.cache.set(key, roster, KEEP);
    return 'ok';
  }

  /** Pulls every rostered character's raid pages that are missing or a day old, newest raid first. */
  private async sweep(): Promise<void> {
    const raids = this.cachedRaids();
    const zoneIds = [...new Set(raids.map((r) => r.zoneId))].reverse();
    for (const zoneId of zoneIds) {
      const zoneRaids = raids.filter((r) => r.zoneId === zoneId);
      for (const realm of REALMS) {
        const due = this.roster(realm.slug)
          .names.map((name) => ({ region: REALM_REGION, realm: realm.slug, name }))
          .filter((ref) =>
            zoneRaids.some((raid) => {
              const at = this.cache.fetchedAt(`view|${jobKey({ kind: 'zone', ref, raidId: raid.id })}`);
              return at == null || Date.now() - at > SWEEP_REFRESH;
            }),
          );
        for (let i = 0; i < due.length; i += SWEEP_BATCH) {
          if (this.live.headroom() <= SWEEP_RESERVE) return;
          const chunk = due.slice(i, i + SWEEP_BATCH);
          try {
            await this.live.prefetchCharacters(chunk, zoneId);
          } catch (err) {
            if (err instanceof ApiFailure && err.code === 'rate_limited') return;
            console.error(`[parsecheck] Pulling a batch of ${realm.name} characters failed: ${err instanceof Error ? err.message : err}`);
            continue;
          }
          for (const ref of chunk)
            for (const raid of zoneRaids) if ((await this.pull({ kind: 'zone', ref, raidId: raid.id })) === 'limited') return;
        }
      }
    }
  }

  private async pull(job: Job): Promise<'ok' | 'limited' | 'failed'> {
    const key = jobKey(job);
    try {
      const page =
        job.kind === 'zone' ? await this.live.zoneReport(job.ref, job.raidId, job.spec) : await this.live.compare(job.ref, job.encounterId, job.spec);
      this.cache.set(`view|${key}`, page, KEEP);
      this.cache.set(`notfound|${key}`, null, -1);
      return 'ok';
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'rate_limited') return 'limited';
      const detail = err instanceof Error ? err.message : String(err);
      const code = err instanceof ApiFailure ? err.code : 'upstream';
      if (code === 'not_found' || code === 'bad_request') {
        this.cache.set(`notfound|${key}`, { message: detail, code }, NOT_FOUND_TTL);
      } else {
        // Unexpected failures are logged with Warcraft Logs' own message and retried soon.
        console.error(`[parsecheck] Pull failed for ${key}: ${detail}`);
        this.cache.set(`notfound|${key}`, { message: `Warcraft Logs returned an error for this lookup; it will be retried shortly. (${detail})`, code }, RETRY_AFTER);
      }
      return 'failed';
    }
  }
}

/**
 * Pages saved by earlier versions of the site may lack newer fields. Fill them in on read so old
 * saved data keeps working without being pulled again.
 */
export function upgradePage<T>(page: T, fetchedAt: number, job: Job): T {
  const p = page as Record<string, unknown>;
  const out: Record<string, unknown> = { ...p, updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : fetchedAt };
  if (job.kind === 'zone') {
    const report = page as unknown as ZoneReport;
    if (!Array.isArray(report.specs)) out.specs = classByName(report.character?.className ?? '')?.specs ?? [];
    if (typeof report.mainSpec !== 'string') out.mainSpec = job.spec ?? report.rows?.find((r) => r.best != null)?.spec ?? report.rows?.[0]?.spec ?? '';
    if (report.spec === undefined) out.spec = job.spec ?? null;
  }
  return out as T;
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
    const zones = this.cache.peekAny<typeof TBC_ZONES>('zones-v2')?.value;
    return raidsFromZones(zones ?? TBC_ZONES);
  }

  status(): ApiStatus {
    return {
      ...this.live.status(),
      queued: this.puller.queue().length,
      nextUpdateInSec: this.puller.secondsUntilNextRun(),
      realms: this.puller.progress(),
    };
  }

  /** Names known on a realm, for the search box suggestions. */
  async characterNames(realm: string): Promise<string[]> {
    return this.puller.roster(realm).names;
  }

  async zoneReport(ref: CharacterRef, raidId?: string, spec?: string): Promise<ZoneReport> {
    const raids = await this.raids();
    const id = raidId ?? raids[raids.length - 1]?.id;
    if (!raids.some((r) => r.id === id)) throw new ApiFailure('not_found', `Unknown raid "${raidId}".`);
    if (spec && !/^[A-Za-z]+$/.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');
    return this.read<ZoneReport>({ kind: 'zone', ref, raidId: id!, ...(spec ? { spec } : {}) });
  }

  async compare(ref: CharacterRef, encounterId: number, spec: string): Promise<Comparison> {
    if (!/^[A-Za-z]+$/.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');
    return this.read<Comparison>({ kind: 'compare', ref, encounterId, spec });
  }

  private read<T>(job: Job): T {
    const key = jobKey(job);
    this.touch(key, job);
    const saved = this.cache.peekAny<T>(`view|${key}`);
    if (saved) return upgradePage(saved.value, saved.fetchedAt, job);
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
