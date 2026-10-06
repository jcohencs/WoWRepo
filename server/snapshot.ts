import { REALM_REGION, REALMS, type ApiStatus, type Benchmark, type Comparison, type Leaderboard, type Metric, type Raid, type ZoneReport } from '../shared/types.js';
import { keyString } from './core/benchmark.js';
import { buildRow, summarise } from './core/report.js';
import { lastDailyTime } from './core/schedule.js';
import { DAY, HOUR, MINUTE, type TtlCache } from './cache.js';
import { CLASSES, classByName } from './core/classes.js';
import type { CharacterRef } from './core/input.js';
import { normaliseRaidId, raidsFromZones } from './core/raids.js';
import { TBC_ZONES } from './core/zones.js';
import { ApiFailure } from './errors.js';
import type { Provider } from './provider.js';
import type { WclProvider } from './wcl/provider.js';

/**
 * The site works in two halves that share one saved store:
 *
 * - `SnapshotProvider` answers visitors from finished, saved pages. Something not saved yet (an
 *   ability comparison, a spec nobody opened) is pulled right away, saved, and shown — no queue.
 * - `Puller` runs on a timer. It finds everyone raiding on the realm and pulls their raid pages
 *   ahead of time, then keeps opened pages fresh, for as long as this hour's allowance lasts.
 */

type Job =
  | { kind: 'zone'; ref: CharacterRef; raidId: string; spec?: string }
  | { kind: 'compare'; ref: CharacterRef; encounterId: number; spec: string; week?: number };

/** Pages built by the realm-wide sweep are re-pulled once this old (default daily; RAIDER_REFRESH_HOURS). */
const SWEEP_REFRESH = (Number(process.env.RAIDER_REFRESH_HOURS) || 24) * HOUR;
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
/** How long a "character not found" answer is remembered. */
const NOT_FOUND_TTL = 6 * HOUR;
/** How long before an unexpected failure is retried. */
const RETRY_AFTER = 15 * MINUTE;
/** A visitor's Refresh only re-pulls a page older than this, so the button can't drain the allowance. */
export const REFRESH_COOLDOWN = 10 * MINUTE;
/** Keep this much of the hourly allowance for first-time lookups; Refresh is refused below it. */
const REFRESH_RESERVE = 0.15;
/**
 * The realm-wide discovery and sweep only use the allowance while this much is left, so a share
 * of every hour stays free for visitors' lookups, refreshes and `npm run doctor`.
 */
const SWEEP_RESERVE = Number(process.env.SWEEP_RESERVE) || 0.2;
const KEEP = 365 * DAY;
/**
 * The #1 lists are pulled once a day at 10:00 AM Eastern: Warcraft Logs takes a while to verify
 * new logs, so pulling more often wouldn't change them.
 */
export const LEADERS_HOUR = 10;
export const LEADERS_ZONE = 'America/New_York';

/**
 * What is written to disk: finished pages, benchmarks, rosters and bookkeeping. Raw Warcraft Logs
 * replies (character rankings, kill lists, report tables) are only needed while building a page,
 * so they stay in memory and are re-fetched if needed after a restart.
 */
export const persisted = (key: string) => !/^(char\||kills\||side\||tables\d*\||compare\d*\||zones-v2-failed)/.test(key);

/**
 * Saved raid pages don't keep their own copy of each boss's benchmark (thousands of pages share a
 * few hundred benchmarks); `withBenchmarks` puts them back when a page is read.
 */
export function packSaved(key: string, value: unknown): unknown {
  if (!key.startsWith('view|zone|') || !value || !Array.isArray((value as ZoneReport).rows)) return value;
  const page = value as ZoneReport;
  if (page.rows.every((r) => r.benchmark === null)) return value;
  return { ...page, rows: page.rows.map((r) => (r.benchmark === null ? r : { ...r, benchmark: null })) };
}

const refKey = (r: CharacterRef) => `${r.region}|${r.realm}|${r.name}`;
export const jobKey = (j: Job) =>
  j.kind === 'zone'
    ? `zone|${refKey(j.ref)}|${j.raidId}${j.spec ? `|${j.spec}` : ''}`
    : `compare|${refKey(j.ref)}|${j.encounterId}|${j.spec}${j.week ? `|${j.week}` : ''}`;

export class Puller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private nextRunAt = Date.now();

  constructor(
    private readonly live: WclProvider,
    private readonly cache: TtlCache,
    readonly intervalMs = 15 * MINUTE,
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
    return this.cache.peekAny<Raid[]>('raids-v1')?.value ?? raidsFromZones(TBC_ZONES);
  }

  private readonly pulling = new Map<string, Promise<'ok' | 'limited' | 'failed'>>();

  /**
   * Pulls one page right now (for a visitor), sharing the work if several people ask at once.
   * If the allowance is used up, the page is queued for the next scheduled pass instead.
   */
  pullNow(job: Job): Promise<'ok' | 'limited' | 'failed'> {
    const key = jobKey(job);
    let run = this.pulling.get(key);
    if (!run) {
      run = this.pull(job)
        .then((outcome) => {
          if (outcome === 'limited') this.enqueue(job);
          return outcome;
        })
        .finally(() => this.pulling.delete(key));
      this.pulling.set(key, run);
    }
    return run;
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
          const mins = Math.round(this.intervalMs / MINUTE);
          console.log(`[logsforever] Pull finished and saved. Up to date (latest raid): ${p}. Waiting: ${this.queue().length}. Next pull in ${mins} min.`);
        }
      });
    }
    return this.running;
  }

  private async pass(): Promise<void> {
    await this.live.raids().catch(() => undefined); // keeps the raid list current (cached a week)
    this.cache.delete('pages'); // list of opened pages kept by older versions; no longer used

    // 1. Anything a visitor opened while the allowance was used up, oldest first.
    while (this.queue().length) {
      const job = this.queue()[0];
      const outcome = await this.pull(job);
      if (outcome === 'limited') return;
      this.cache.set('queue', this.queue().filter((j) => jobKey(j) !== jobKey(job)), KEEP);
    }

    // 2. The #1 of each class, once a day after 10:00 AM Eastern (and a raid a visitor opened that
    //    was never pulled). Runs before the sweep so it never waits behind it.
    if ((await this.pullLeaders()) === 'limited') return;

    // 3. Find who raids on each realm (re-checked daily).
    for (const realm of REALMS) if ((await this.discover(realm.slug)) === 'limited') return;

    // 4. Pull everyone on the realms, newest raid first.
    await this.sweep();
  }

  /**
   * Pulls the #1 lists that are due: every saved raid (and the newest) once a day after 10:00 AM
   * Eastern, plus any raid a visitor opened that was never pulled.
   */
  private async pullLeaders(): Promise<'ok' | 'limited'> {
    const raids = this.cachedRaids();
    const wanted = this.cache.peekAny<string[]>('leaders-wanted')?.value ?? [];
    const since = lastDailyTime(Date.now(), LEADERS_HOUR, LEADERS_ZONE);
    for (const raid of raids) {
      for (const realm of REALMS) {
        const at = this.cache.fetchedAt(this.live.leadersKey(REALM_REGION, realm.slug, raid.id));
        const due = at == null ? raid === raids.at(-1) || wanted.includes(raid.id) : at < since;
        if (!due) continue;
        try {
          await this.live.classLeaders(REALM_REGION, realm.slug, raid);
        } catch (err) {
          if (err instanceof ApiFailure && err.code === 'rate_limited') return 'limited';
          console.error(`[logsforever] Pulling the #1 players on ${realm.name} failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    if (wanted.length) this.cache.delete('leaders-wanted');
    return 'ok';
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
        console.error(`[logsforever] Finding raiders on ${realm} failed: ${err instanceof Error ? err.message : err}`);
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

  /**
   * Rostered characters whose pages for these raids are missing or a day old. Characters Warcraft
   * Logs couldn't find recently are skipped, so a renamed character isn't retried every pass.
   */
  private dueFor(zoneRaids: Raid[], realm: string): CharacterRef[] {
    return this.roster(realm)
      .names.map((name) => ({ region: REALM_REGION, realm, name }))
      .filter((ref) =>
        zoneRaids.some((raid) => {
          const key = jobKey({ kind: 'zone', ref, raidId: raid.id });
          if (this.cache.peek(`notfound|${key}`)) return false;
          const at = this.cache.fetchedAt(`view|${key}`);
          return at == null || Date.now() - at > SWEEP_REFRESH;
        }),
      );
  }

  /** How much of the realm-wide pull is left: discovery still running, and characters still due per raid tier. */
  remaining(): { discovering: boolean; characters: number; total: number } {
    const raids = this.cachedRaids();
    const zoneIds = [...new Set(raids.map((r) => r.zoneId))];
    let characters = 0;
    let total = 0;
    for (const realm of REALMS) {
      const names = this.roster(realm.slug).names.length;
      for (const zoneId of zoneIds) {
        characters += this.dueFor(raids.filter((r) => r.zoneId === zoneId), realm.slug).length;
        total += names;
      }
    }
    const discovering = REALMS.some((r) => {
      const roster = this.roster(r.slug);
      return roster.tasks != null || roster.discoveredAt === 0;
    });
    return { discovering, characters, total };
  }

  /** Pulls every rostered character's raid pages that are missing or a day old, newest raid first. */
  private async sweep(): Promise<void> {
    const raids = this.cachedRaids();
    const zoneIds = [...new Set(raids.map((r) => r.zoneId))].reverse();
    for (const zoneId of zoneIds) {
      const zoneRaids = raids.filter((r) => r.zoneId === zoneId);
      for (const realm of REALMS) {
        const due = this.dueFor(zoneRaids, realm.slug);
        for (let i = 0; i < due.length; i += SWEEP_BATCH) {
          if (this.live.headroom() <= SWEEP_RESERVE) return;
          const chunk = due.slice(i, i + SWEEP_BATCH);
          if (this.log) {
            const fresh = chunk.filter((ref) => zoneRaids.some((raid) => this.cache.fetchedAt(`view|${jobKey({ kind: 'zone', ref, raidId: raid.id })}`) == null)).length;
            const why = [fresh && `${fresh} new`, chunk.length - fresh && `${chunk.length - fresh} refreshing (pulled over ${Math.round(SWEEP_REFRESH / HOUR)}h ago)`].filter(Boolean).join(', ');
            console.log(`[logsforever] ${realm.name} · ${zoneRaids.map((r) => r.name).join(' / ')} · ${chunk.map((r) => r.name).join(', ')} — ${why}`);
          }
          try {
            await this.live.prefetchCharacters(chunk, zoneId);
          } catch (err) {
            if (err instanceof ApiFailure && err.code === 'rate_limited') return;
            console.error(`[logsforever] Pulling a batch of ${realm.name} characters failed: ${err instanceof Error ? err.message : err}`);
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
        job.kind === 'zone' ? await this.live.zoneReport(job.ref, job.raidId, job.spec) : await this.live.compare(job.ref, job.encounterId, job.spec, job.week);
      this.cache.set(`view|${key}`, page, KEEP);
      this.cache.delete(`notfound|${key}`);
      return 'ok';
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'rate_limited') return 'limited';
      const detail = err instanceof Error ? err.message : String(err);
      const code = err instanceof ApiFailure ? err.code : 'upstream';
      if (code === 'not_found' || code === 'bad_request') {
        this.cache.set(`notfound|${key}`, { message: detail, code }, NOT_FOUND_TTL);
      } else {
        // Unexpected failures are logged with Warcraft Logs' own message and retried soon.
        console.error(`[logsforever] Pull failed for ${key}: ${detail}`);
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
    return this.cache.peekAny<Raid[]>('raids-v1')?.value ?? raidsFromZones(TBC_ZONES);
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
    const id = raidId ? normaliseRaidId(raidId) : raids[raids.length - 1]?.id;
    if (!raids.some((r) => r.id === id)) throw new ApiFailure('not_found', `That raid isn't on Warcraft Logs yet.`);
    if (spec && !/^[A-Za-z]+$/.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');
    return this.read<ZoneReport>({ kind: 'zone', ref, raidId: id!, ...(spec ? { spec } : {}) });
  }

  async compare(ref: CharacterRef, encounterId: number, spec: string, week?: number): Promise<Comparison> {
    if (!/^[A-Za-z]+$/.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');
    return this.read<Comparison>({ kind: 'compare', ref, encounterId, spec, ...(week ? { week } : {}) });
  }

  private async read<T>(job: Job): Promise<T> {
    const key = jobKey(job);
    const saved = this.cache.peekAny<T>(`view|${key}`);
    if (saved) {
      // Pages outside the realm sweep (comparisons, other specs) follow the same daily refresh:
      // the saved copy is shown now and a newer one is pulled for next time.
      if (Date.now() - saved.fetchedAt > SWEEP_REFRESH && this.live.headroom() > REFRESH_RESERVE) void this.puller.pullNow(job);
      return this.withBenchmarks(upgradePage(saved.value, saved.fetchedAt, job), job);
    }
    const failed = this.cache.peek<{ message: string; code: ApiFailure['code'] } | null>(`notfound|${key}`);
    if (failed) throw new ApiFailure(failed.code, failed.message);

    const outcome = await this.puller.pullNow(job);
    const fresh = this.cache.peekAny<T>(`view|${key}`);
    if (outcome === 'ok' && fresh) return this.withBenchmarks(upgradePage(fresh.value, fresh.fetchedAt, job), job);
    if (outcome === 'limited') {
      const mins = Math.max(1, Math.ceil(this.live.status().resetsInSec ?? 600) / 60);
      throw new ApiFailure('rate_limited', `Warcraft Logs is busy right now. This will be ready in about ${Math.ceil(mins)} minutes — check back then.`);
    }
    const why = this.cache.peek<{ message: string; code: ApiFailure['code'] } | null>(`notfound|${key}`);
    throw new ApiFailure(why?.code ?? 'upstream', why?.message ?? 'Warcraft Logs returned an error. Please try again shortly.');
  }


  /**
   * The page's Refresh button: forgets everything saved for this character (their raid pages'
   * source data and every boss comparison) and pulls the raid page again now. A page refreshed in
   * the last few minutes is just returned, and nothing is pulled while the allowance is low.
   */
  async refresh(ref: CharacterRef, raidId?: string, spec?: string): Promise<ZoneReport> {
    const raids = await this.raids();
    const id = raidId ? normaliseRaidId(raidId) : raids[raids.length - 1]?.id;
    if (!raids.some((r) => r.id === id)) throw new ApiFailure('not_found', `That raid isn't on Warcraft Logs yet.`);
    if (spec && !/^[A-Za-z]+$/.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');
    const job: Job = { kind: 'zone', ref, raidId: id!, ...(spec ? { spec } : {}) };
    const at = this.cache.fetchedAt(`view|${jobKey(job)}`);
    if (at != null && Date.now() - at < REFRESH_COOLDOWN) return this.read<ZoneReport>(job);
    const who = refKey(ref);
    // Raw replies are dropped either way, so whenever the pull happens it gets new data.
    for (const prefix of [`char|${who}|`, `kills|${who}|`, `compare2|${who}|`]) this.cache.deletePrefix(prefix);
    if (this.live.headroom() <= REFRESH_RESERVE) {
      // No room this hour: pull it on the next pass and keep showing the saved page, without fuss.
      this.puller.enqueue(job);
      return this.read<ZoneReport>(job);
    }
    for (const prefix of [`view|compare|${who}|`, `notfound|compare|${who}|`, `notfound|zone|${who}|`]) this.cache.deletePrefix(prefix);
    await this.puller.pullNow(job); // if the allowance runs out mid-way it is queued for the next pass
    return this.read<ZoneReport>(job);
  }

  private leadersLoading: Promise<Leaderboard> | null = null;

  /**
   * The realm's #1 player of every class in a raid, from Warcraft Logs' realm rankings. The saved
   * list is shown (the puller replaces it once a day at 10:00 AM Eastern); a raid that was never
   * pulled is pulled now if the allowance allows, or first thing on the next pass.
   */
  async leaders(realm: string, raidId?: string): Promise<Leaderboard> {
    const raids = await this.raids();
    const raid = (raidId ? raids.find((r) => r.id === normaliseRaidId(raidId)) : raids[raids.length - 1]) ?? null;
    const empty = (): Leaderboard => ({
      realm,
      raid: raid && { id: raid.id, name: raid.name },
      classes: Object.values(CLASSES).map((c) => ({ className: c.name, leaders: [] })),
      updatedAt: null,
    });
    if (!raid) return empty();
    const saved = this.cache.peekAny<Leaderboard>(this.live.leadersKey(REALM_REGION, realm, raid.id));
    const load = () => {
      this.leadersLoading ??= this.live.classLeaders(REALM_REGION, realm, raid).finally(() => (this.leadersLoading = null));
      return this.leadersLoading;
    };
    // A saved list is always shown as-is; only the 10:00 AM pull replaces it.
    if (saved) return saved.value;
    const later = () => {
      // Not now: the next pass pulls it before anything else.
      const wanted = this.cache.peekAny<string[]>('leaders-wanted')?.value ?? [];
      if (!wanted.includes(raid.id)) this.cache.set('leaders-wanted', [...wanted, raid.id], 365 * DAY);
      return empty();
    };
    if (this.live.headroom() <= REFRESH_RESERVE) return later();
    try {
      return await load();
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'rate_limited') return later();
      throw err;
    }
  }

  /** Fills each boss row's benchmark back in from the shared saved benchmarks (see `packSaved`). */
  private withBenchmarks<T>(page: T, job: Job): T {
    if (job.kind !== 'zone') return page;
    const report = page as unknown as ZoneReport;
    const className = report.character?.className;
    if (!className || !Array.isArray(report.rows)) return page;
    const rows = report.rows.map((r) => {
      const saved = this.cache.peekAny<Benchmark | null>(`bench|${keyString({ encounterId: r.encounter.id, className, spec: r.spec, metric: r.metric })}`);
      if (!saved) return r;
      const best = { encounterId: r.encounter.id, spec: r.spec, kills: r.kills, best: r.best, rankPercent: r.rankPercent };
      return buildRow(r.encounter, r.spec, r.metric, best, saved.value);
    });
    return { ...report, rows, summary: summarise(rows) } as T;
  }


}
