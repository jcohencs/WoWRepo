import type { Benchmark, Comparison, FightSide, Metric, Raid, Site, Zone, ZoneReport } from '../../shared/types.js';
import { join, resolve } from 'node:path';
import { DAY, HOUR, MINUTE, TtlCache } from '../cache.js';
import {
  buildBenchmark,
  keyString,
  pagesNeeded,
  rankingCount,
  type BenchmarkKey,
  type RawRanking,
  type RawRankingPage,
} from '../core/benchmark.js';
import { CLASSES, classById, metricFor, metricForSpec, specLabel, type ClassInfo } from '../core/classes.js';
import { compareAbilities, type TableEntry } from '../core/compare.js';
import { bestPerWeek, preparation, takenBySchool, timelineFromGraph, type Kill } from '../core/fight.js';
import type { CharacterRef } from '../core/input.js';
import { normaliseRaidId, raidsFromZones } from '../core/raids.js';
import { buildRow, mainSpec, summarise, type CharacterBest } from '../core/report.js';
import { TBC_ZONES, tbcZonesFromExpansions } from '../core/zones.js';
import { ApiFailure } from '../errors.js';
import type { Provider } from '../provider.js';
import { WclClient } from './client.js';

interface ZoneRankingEntry {
  encounter: { id: number; name: string };
  spec?: string;
  totalKills?: number;
  rankPercent?: number | null;
  bestAmount?: number;
}

interface ZoneRankings {
  rankings?: ZoneRankingEntry[];
}

interface CharacterResponse {
  characterData: {
    character: null | {
      name: string;
      classID: number;
      server: { name: string; slug: string };
      dps: ZoneRankings | null;
      hps: ZoneRankings | null;
    };
  };
}

interface EncounterRanks {
  ranks?: {
    amount: number;
    duration: number;
    startTime?: number;
    rankPercent?: number;
    spec?: string;
    report: { code: string; fightID: number; startTime?: number };
  }[];
}

interface BuffTable {
  data?: { totalTime?: number; auras?: { name: string; totalUptime?: number }[]; entries?: { name: string; totalUptime?: number }[] };
}

interface ReportTable {
  data?: { totalTime?: number; entries?: (TableEntry & { id?: number; activeTime?: number })[] };
}

/** The character's best kill on one encounter, as needed by the comparison. */
/** Every ranked kill a character has on one boss with one spec. */
interface KillHistory {
  name: string;
  server: string;
  cls: ClassInfo;
  kills: Kill[];
}

/** One side of a comparison resolved to a player inside a report fight. */
interface ResolvedSide {
  name: string;
  server: string;
  code: string;
  fightId: number;
  startTime: number;
  endTime: number;
  sourceId: number;
  total: number;
  activeTime: number | null;
}

const SAFE_NAME = /^[A-Za-z]+$/;



const killsFrom = (ranks: EncounterRanks | null | undefined): Kill[] =>
  // Hidden or deleted logs come back without a report; skip them rather than fail.
  (ranks?.ranks ?? []).filter((r) => r?.report?.code && r.report.fightID != null && Number.isFinite(r.amount)).map((r) => ({
    startTime: r.startTime ?? r.report.startTime ?? 0,
    amount: r.amount,
    rankPercent: r.rankPercent ?? null,
    code: r.report.code,
    fight: r.report.fightID,
  }));

/** Where cached Warcraft Logs responses live between restarts. */
/** Snapshot made by `npm run prefill`, committed to the repo so a new server starts with everyone pulled. */
export const seedFile = (site: Site) => join(resolve(import.meta.dirname, '../..'), 'data', `seed-${site}.json.gz`);

export const cacheFile = (site: Site, dir?: string) => join(dir || join(resolve(import.meta.dirname, '../..'), '.cache'), `wcl-${site}.json`);

/**
 * How old each kind of saved data may get before it is refreshed in the background. Visitors are
 * always served the saved copy meanwhile. Reports never change once uploaded.
 */
const TTL = {
  zones: 7 * DAY,
  character: 2 * HOUR,
  bestKill: 2 * HOUR,
  benchmark: DAY,
  report: 30 * DAY,
  compare: 6 * HOUR,
};

/** Keep this share of the hourly allowance free for first-time lookups. */
export const REFRESH_HEADROOM = 0.35;

export class WclProvider implements Provider {
  readonly demo = false;
  private readonly refreshing = new Set<string>();

  constructor(
    private readonly client: WclClient,
    readonly site: Site,
    private readonly cache: TtlCache = new TtlCache(),
  ) {}

  /** Background refreshes only use the allowance while plenty is left for new lookups. */
  private canRefresh(): boolean {
    return this.cache.serveStale && this.client.headroom() > REFRESH_HEADROOM;
  }

  headroom(): number {
    return this.client.headroom();
  }

  /** The live provider doesn't keep a roster; the scheduled puller does. */
  async characterNames(): Promise<string[]> {
    return [];
  }

  status() {
    const r = this.client.rateLimit();
    return {
      limitPerHour: r?.limitPerHour ?? null,
      pointsSpent: r?.pointsSpentThisHour ?? null,
      resetsInSec: r ? Math.max(0, Math.round((r.resetsAt - Date.now()) / 1000)) : null,
      savedResults: this.cache.size,
    };
  }

  /**
   * TBC raid zones on this Warcraft Logs site. Only a successful lookup is saved (for a week); if
   * it fails, the built-in TBC Classic list is used and the lookup is retried after 10 minutes.
   */
  private async zones(): Promise<Zone[]> {
    const saved = this.cache.peek<Zone[]>('zones-v2');
    if (saved) return saved;
    if (this.cache.peek('zones-v2-failed')) return TBC_ZONES;
    try {
      const data = await this.client.query<{ worldData: { expansions: Parameters<typeof tbcZonesFromExpansions>[0] } }>(
        `{ worldData { expansions { id name zones { id name frozen encounters { id name } } } } }`,
      );
      const zones = tbcZonesFromExpansions(data.worldData.expansions);
      if (zones.length) {
        this.cache.set('zones-v2', zones, TTL.zones);
        return zones;
      }
      console.error('[logsforever] Warcraft Logs listed no TBC raid zones; using the built-in list for now.');
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'config') throw err;
      console.error(`[logsforever] Could not load the raid list: ${err instanceof Error ? err.message : err}`);
    }
    this.cache.set('zones-v2-failed', true, 10 * MINUTE);
    return TBC_ZONES;
  }


  /**
   * TBC raids on this site that have ranked kills, newest last. Raids not out yet (no rankings)
   * are left out. Saved for a day under `raids-v1`, which the visitor side also reads.
   */
  async raids(): Promise<Raid[]> {
    const saved = this.cache.peek<Raid[]>('raids-v1');
    if (saved) return saved;
    const zones = await this.zones();
    const all = raidsFromZones(zones);
    if (zones === TBC_ZONES) return all; // fallback list: don't save it
    const released = await this.releasedRaids(all);
    const list = released ? all.filter((r) => released.has(r.id)) : all;
    const raids = list.length ? list : all;
    this.cache.set('raids-v1', raids, DAY);
    return raids;
  }

  /** Raids whose first boss has any ranked kill, from one batched query; null if it can't be checked. */
  private async releasedRaids(raids: Raid[]): Promise<Set<string> | null> {
    try {
      const data = await this.client.query<{ worldData: Record<string, { characterRankings: RawRankingPage } | null> }>(
        `{ worldData { ${raids
          .map((r, i) => `q${i}: encounter(id: ${r.encounters[0].id}) { characterRankings(metric: dps, page: 1) }`)
          .join('\n')} } }`,
      );
      return new Set(raids.filter((_, i) => (data.worldData[`q${i}`]?.characterRankings?.rankings?.length ?? 0) > 0).map((r) => r.id));
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'rate_limited') throw err;
      return null;
    }
  }

  /**
   * A character's raid page. With `spec`, every boss is shown and benchmarked as that spec;
   * without it, each boss uses the spec of the character's best kill there.
   */
  async zoneReport(ref: CharacterRef, raidId?: string, spec?: string): Promise<ZoneReport> {
    const raids = await this.raids();
    const raid = raidId ? raids.find((r) => r.id === normaliseRaidId(raidId)) : raids[raids.length - 1];
    if (!raid) throw new ApiFailure('not_found', `Unknown raid "${raidId}".`);
    if (spec && !SAFE_NAME.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');

    const charKey = this.charKey(ref, raid.zoneId, spec);
    const character = await this.cache.get(charKey, TTL.character, () => this.fetchCharacter(ref, raid.zoneId, spec));
    const c = character.characterData.character;
    if (!c) throw new ApiFailure('not_found', `Couldn't find "${ref.name}" on ${ref.realm} (${ref.region}). Check the spelling and realm.`);
    const cls = classById(c.classID);
    if (!cls) throw new ApiFailure('bad_request', `${c.name} is not a TBC class.`);
    if (spec && !cls.specs.includes(spec)) throw new ApiFailure('bad_request', `${cls.label}s don't have a ${specLabel(spec)} spec.`);

    const sets: Record<Metric, Map<number, ZoneRankingEntry>> = {
      dps: new Map((c.dps?.rankings ?? []).map((r) => [r.encounter.id, r])),
      hps: new Map((c.hps?.rankings ?? []).map((r) => [r.encounter.id, r])),
    };
    const toBest = (r: ZoneRankingEntry): CharacterBest => ({
      encounterId: r.encounter.id,
      spec: r.spec ?? '',
      kills: r.totalKills ?? 0,
      best: r.bestAmount ?? null,
      rankPercent: r.rankPercent ?? null,
    });
    const main = mainSpec([...sets.dps.values()].map(toBest), cls.specs[0]);

    const plan = raid.encounters.map((encounter) => {
      const seen = sets.dps.get(encounter.id);
      const rowSpec = spec ?? (seen?.spec && seen.totalKills ? seen.spec : main);
      const metric = metricFor(cls.name, rowSpec);
      const best = sets[metric].get(encounter.id);
      return { encounter, spec: rowSpec, metric, best: best ? toBest(best) : undefined };
    });
    const keyOf = (p: (typeof plan)[number]): BenchmarkKey => ({ encounterId: p.encounter.id, className: cls.name, spec: p.spec, metric: p.metric });

    const benchmarks = await this.getBenchmarks(plan.map(keyOf));
    const rows = plan.map((p) => buildRow(p.encounter, p.spec, p.metric, p.best, benchmarks.get(keyString(keyOf(p))) ?? null));


    return {
      character: { name: c.name, realm: c.server.slug, realmName: c.server.name, region: ref.region, className: cls.name },
      raid,
      rows,
      summary: summarise(rows),
      updatedAt: this.cache.fetchedAt(charKey) ?? Date.now(),
      spec: spec ?? null,
      mainSpec: spec ?? main,
      specs: cls.specs,
    };
  }

  /** Re-fetches the character's raid page, ignoring what is saved. */
  async refresh(ref: CharacterRef, raidId?: string, spec?: string): Promise<ZoneReport> {
    const who = `${ref.region}|${ref.realm}|${ref.name}|`;
    for (const prefix of [`char|${who}`, `kills|${who}`, `compare2|${who}`]) this.cache.deletePrefix(prefix);
    return this.zoneReport(ref, raidId, spec);
  }

  charKey(ref: CharacterRef, zoneId: number, spec?: string) {
    return `char|${ref.region}|${ref.realm}|${ref.name}|${zoneId}${spec ? `|${spec}` : ''}`;
  }

  /**
   * Fetches several characters' raid rankings in one request and saves each one, so their pages
   * can then be built without further calls. Returns how many were found.
   */
  async prefetchCharacters(refs: CharacterRef[], zoneId: number): Promise<number> {
    if (!refs.length) return 0;
    const vars: Record<string, unknown> = { zone: zoneId };
    const defs = ['$zone: Int!'];
    const fields = refs.map((r, i) => {
      vars[`n${i}`] = r.name;
      vars[`s${i}`] = r.realm;
      vars[`r${i}`] = r.region;
      defs.push(`$n${i}: String!`, `$s${i}: String!`, `$r${i}: String!`);
      return `c${i}: character(name: $n${i}, serverSlug: $s${i}, serverRegion: $r${i}) {
        name classID server { name slug }
        dps: zoneRankings(zoneID: $zone, metric: dps)
        hps: zoneRankings(zoneID: $zone, metric: hps)
      }`;
    });
    const data = await this.client.query<{ characterData: Record<string, CharacterResponse['characterData']['character']> }>(
      `query(${defs.join(', ')}) { characterData { ${fields.join('\n')} } }`,
      vars,
    );
    let found = 0;
    refs.forEach((ref, i) => {
      const character = data.characterData[`c${i}`] ?? null;
      if (character) found++;
      this.cache.set(this.charKey(ref, zoneId), { characterData: { character } } satisfies CharacterResponse, TTL.character);
    });
    return found;
  }

  /**
   * Ranked players on one realm for a boss (all classes), one page each. Used to discover who
   * raids on the realm.
   */
  async realmRankings(
    region: string,
    realm: string,
    items: { encounterId: number; metric: Metric; page: number }[],
  ): Promise<{ names: string[]; hasMore: boolean }[]> {
    const data = await this.client.query<{ worldData: Record<string, { characterRankings: RawRankingPage } | null> }>(
      `query($region: String!, $realm: String!) { worldData { ${items
        .map(
          (it, i) =>
            `q${i}: encounter(id: ${it.encounterId}) { characterRankings(metric: ${it.metric}, page: ${it.page}, serverRegion: $region, serverSlug: $realm) }`,
        )
        .join('\n')} } }`,
      { region, realm },
    );
    return items.map((_, i) => {
      const page = data.worldData[`q${i}`]?.characterRankings;
      return { names: (page?.rankings ?? []).map((r) => r.name), hasMore: Boolean(page?.hasMorePages) };
    });
  }

  private fetchCharacter(ref: CharacterRef, zoneId: number, spec?: string) {
    const bySpec = spec ? ', specName: $spec' : '';
    return this.client.query<CharacterResponse>(
      `query($name: String!, $server: String!, $region: String!, $zone: Int!${spec ? ', $spec: String!' : ''}) {
        characterData { character(name: $name, serverSlug: $server, serverRegion: $region) {
          name classID server { name slug }
          dps: zoneRankings(zoneID: $zone, metric: dps${bySpec})
          hps: zoneRankings(zoneID: $zone, metric: hps${bySpec})
        } }
      }`,
      { name: ref.name, server: ref.realm, region: ref.region, zone: zoneId, ...(spec ? { spec } : {}) },
    );
  }

  private bestKillKey(ref: CharacterRef, encounterId: number, spec: string, metric: Metric) {
    return `kills|${ref.region}|${ref.realm}|${ref.name}|${encounterId}|${spec}|${metric}`;
  }

  /** All of the character's ranked kills of a boss as this spec (for the best kill and the weekly view). */
  private killHistory(ref: CharacterRef, encounterId: number, spec: string, metric: Metric): Promise<KillHistory> {
    return this.cache.get(this.bestKillKey(ref, encounterId, spec, metric), TTL.bestKill, async () => {
      const data = await this.client.query<{
        characterData: { character: null | { name: string; classID: number; server: { name: string }; ranks: EncounterRanks | null } };
      }>(
        `query($name: String!, $server: String!, $region: String!, $enc: Int!, $spec: String!) {
          characterData { character(name: $name, serverSlug: $server, serverRegion: $region) {
            name classID server { name }
            ranks: encounterRankings(encounterID: $enc, metric: ${metric}, specName: $spec)
          } }
        }`,
        { name: ref.name, server: ref.realm, region: ref.region, enc: encounterId, spec },
      );
      const c = data.characterData.character;
      if (!c) throw new ApiFailure('not_found', `Couldn't find "${ref.name}" on ${ref.realm} (${ref.region}).`);
      const cls = classById(c.classID);
      if (!cls) throw new ApiFailure('bad_request', `${c.name} is not a TBC class.`);
      return { name: c.name, server: c.server.name, cls, kills: killsFrom(c.ranks) };
    });
  }

  /**
   * Saved benchmarks are used as-is (stale ones are refreshed in the background when the allowance
   * allows); only benchmarks never pulled before are fetched before returning.
   */
  private async getBenchmarks(keys: BenchmarkKey[]): Promise<Map<string, Benchmark | null>> {
    const result = new Map<string, Benchmark | null>();
    const missing = new Map<string, BenchmarkKey>();
    const stale = new Map<string, BenchmarkKey>();
    for (const k of keys) {
      const id = keyString(k);
      if (!SAFE_NAME.test(k.className) || !SAFE_NAME.test(k.spec)) continue;
      const saved = this.cache.peekAny<Benchmark | null>(`bench|${id}`);
      // The scheduled puller (serveStale off) always re-pulls stale benchmarks before saving a page.
      if (!saved || (!saved.fresh && !this.cache.serveStale)) missing.set(id, k);
      else {
        result.set(id, saved.value);
        if (!saved.fresh && !this.refreshing.has(id)) stale.set(id, k);
      }
    }
    if (stale.size && this.canRefresh()) {
      for (const id of stale.keys()) this.refreshing.add(id);
      void this.fetchBenchmarks(stale)
        .catch(() => undefined)
        .finally(() => stale.forEach((_, id) => this.refreshing.delete(id)));
    }
    if (missing.size) for (const [id, v] of await this.fetchBenchmarks(missing)) result.set(id, v);
    return result;
  }

  /** Two batched queries: page 1 for every key, then the pages holding p50/p99. */
  private async fetchBenchmarks(missing: Map<string, BenchmarkKey>): Promise<Map<string, Benchmark | null>> {
    const result = new Map<string, Benchmark | null>();
    const field = (k: BenchmarkKey, page: number) =>
      `encounter(id: ${k.encounterId}) { characterRankings(className: "${k.className}", specName: "${k.spec}", metric: ${k.metric}, page: ${page}) }`;

    const firstKeys = [...missing.entries()];
    const first = await this.client.query<{ worldData: Record<string, { characterRankings: RawRankingPage } | null> }>(
      `{ worldData { ${firstKeys.map(([, k], i) => `q${i}: ${field(k, 1)}`).join('\n')} } }`,
    );

    const pages = new Map<string, Map<number, RawRanking[]>>();
    const counts = new Map<string, number | null>();
    const extra: { id: string; key: BenchmarkKey; page: number }[] = [];
    firstKeys.forEach(([id, key], i) => {
      const page1 = first.worldData[`q${i}`]?.characterRankings ?? { rankings: [] };
      const count = rankingCount(page1);
      counts.set(id, count);
      pages.set(id, new Map([[1, page1.rankings ?? []]]));
      if (count) for (const page of pagesNeeded(count)) extra.push({ id, key, page });
    });

    if (extra.length) {
      const more = await this.client.query<{ worldData: Record<string, { characterRankings: RawRankingPage } | null> }>(
        `{ worldData { ${extra.map((e, i) => `q${i}: ${field(e.key, e.page)}`).join('\n')} } }`,
      );
      extra.forEach((e, i) => pages.get(e.id)!.set(e.page, more.worldData[`q${i}`]?.characterRankings.rankings ?? []));
    }

    for (const [id, key] of firstKeys) {
      const value = buildBenchmark(key, counts.get(id) ?? null, pages.get(id)!);
      this.cache.set(`bench|${id}`, value, TTL.benchmark);
      result.set(id, value);
    }
    return result;
  }

  /** Finds the player in the fight and reads fight bounds, total and active time. Reports never change, so cache long. */
  private resolveSide(code: string, fightId: number, name: string, server: string, dataType: string): Promise<ResolvedSide> {
    return this.cache.get(`side|${code}|${fightId}|${name}|${dataType}`, TTL.report, async () => {
      const data = await this.client.query<{
        reportData: { report: { fights: { id: number; startTime: number; endTime: number }[]; players: ReportTable } | null };
      }>(
        `query($code: String!, $fight: Int!) {
          reportData { report(code: $code) { fights(fightIDs: [$fight]) { id startTime endTime } players: table(dataType: ${dataType}, fightIDs: [$fight]) } }
        }`,
        { code, fight: fightId },
      );
      const report = data.reportData.report;
      const fight = report?.fights[0];
      const player = report?.players.data?.entries?.find((e) => e.name === name);
      if (!fight || !player?.id) throw new ApiFailure('upstream', `Could not find ${name} in report ${code}.`);
      const totalTime = report.players.data?.totalTime || fight.endTime - fight.startTime;
      return {
        name,
        server,
        code,
        fightId: fight.id,
        startTime: fight.startTime,
        endTime: fight.endTime,
        sourceId: player.id,
        total: player.total,
        activeTime: player.activeTime != null ? player.activeTime / totalTime : null,
      };
    });
  }

  /**
   * Per-ability amounts and casts, plus the fight timeline, damage taken and buffs, in one request.
   * If Warcraft Logs rejects the extra charts, the breakdown is fetched on its own so it always shows.
   */
  private sideTables(s: ResolvedSide, dataType: string) {
    return this.cache.get(`tables2|${s.code}|${s.fightId}|${s.sourceId}|${dataType}`, TTL.report, async () => {
      type Report = { amounts: ReportTable; casts: ReportTable; graph?: unknown; taken?: ReportTable; buffs?: BuffTable };
      const fields = (extras: boolean) => `
            amounts: table(dataType: ${dataType}, fightIDs: [$fight], sourceID: $source, startTime: $start, endTime: $end)
            casts: table(dataType: Casts, fightIDs: [$fight], sourceID: $source, startTime: $start, endTime: $end)${
              extras
                ? `
            graph: graph(dataType: ${dataType}, fightIDs: [$fight], sourceID: $source, startTime: $start, endTime: $end)
            taken: table(dataType: DamageTaken, fightIDs: [$fight], sourceID: $source, startTime: $start, endTime: $end)
            buffs: table(dataType: Buffs, fightIDs: [$fight], sourceID: $source, startTime: $start, endTime: $end)`
                : ''
            }`;
      const run = (extras: boolean) =>
        this.client.query<{ reportData: { report: Report | null } }>(
          `query($code: String!, $fight: Int!, $source: Int!, $start: Float!, $end: Float!) {
          reportData { report(code: $code) {${fields(extras)}
          } }
        }`,
          { code: s.code, fight: s.fightId, source: s.sourceId, start: s.startTime, end: s.endTime },
        );
      let r: Report | null;
      try {
        r = (await run(true)).reportData.report;
      } catch (err) {
        if (err instanceof ApiFailure && err.code === 'rate_limited') throw err;
        console.warn(`[wcl] extra charts unavailable for log ${s.code}, loading the breakdown only: ${(err as Error).message}`);
        r = (await run(false)).reportData.report;
      }
      if (!r) throw new ApiFailure('upstream', `Report ${s.code} is not available.`);
      const durationMs = s.endTime - s.startTime;
      const amounts = r.amounts?.data?.entries ?? [];
      const casts = r.casts?.data?.entries ?? [];
      const total = amounts.reduce((sum, e) => sum + (e.total || 0), 0);
      const safe = <T,>(f: () => T): T | undefined => {
        try {
          return f();
        } catch {
          return undefined;
        }
      };
      return {
        durationMs,
        amounts,
        casts,
        timeline: safe(() => timelineFromGraph(r!.graph, total, durationMs)),
        taken: r.taken ? safe(() => takenBySchool(r!.taken?.data?.entries ?? [], durationMs)) : undefined,
        prep: r.buffs ? safe(() => preparation(r!.buffs?.data?.auras ?? r!.buffs?.data?.entries ?? [], casts, r!.buffs?.data?.totalTime || durationMs)) : undefined,
      };
    });
  }

  /**
   * Your kill of a boss next to the top 1% player's. With `week` (the week's reset, epoch ms) it
   * uses your best kill from that raid week; otherwise your best kill overall.
   */
  async compare(ref: CharacterRef, encounterId: number, spec: string, week?: number): Promise<Comparison> {
    if (!SAFE_NAME.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');
    const raids = await this.raids();
    const encounter = raids.flatMap((r) => r.encounters).find((e) => e.id === encounterId);
    if (!encounter) throw new ApiFailure('not_found', `Unknown encounter ${encounterId}.`);

    const cacheKey = `compare2|${ref.region}|${ref.realm}|${ref.name}|${encounterId}|${spec}${week ? `|${week}` : ''}`;
    return this.cache.get(cacheKey, TTL.compare, async () => {
      const metric = metricForSpec(spec);
      const history = await this.killHistory(ref, encounterId, spec, metric);
      const weeks = bestPerWeek(history.kills);
      const chosen = week ? weeks.find((w) => w.week === week)?.kill : [...history.kills].sort((a, b) => b.amount - a.amount)[0];
      if (!chosen) {
        throw new ApiFailure('not_found', week ? `${ref.name} has no ranked ${spec} kill on ${encounter.name} that week.` : `${ref.name} has no ranked ${spec} kill on ${encounter.name}.`);
      }
      const kill = { name: history.name, server: history.server, cls: history.cls, code: chosen.code, fight: chosen.fight };

      const key = { encounterId, className: kill.cls.name, spec, metric };
      const benchmark = (await this.getBenchmarks([key])).get(keyString(key)) ?? null;
      const dataType = metric === 'hps' ? 'Healing' : 'DamageDone';

      // Both sides load in parallel; each is two small queries, cached per report.
      const load = async (code: string, fight: number, name: string, server: string) => {
        const side = await this.resolveSide(code, fight, name, server, dataType);
        return { side, tables: await this.sideTables(side, dataType) };
      };
      // Your own breakdown always shows; the top 1% side is added when it can be loaded.
      const [you, top] = await Promise.all([
        load(kill.code, kill.fight, kill.name, kill.server),
        benchmark
          ? load(benchmark.reference.reportCode, benchmark.reference.fightId, benchmark.reference.name, benchmark.reference.server).catch((err) => {
              if (err instanceof ApiFailure && err.code === 'rate_limited') throw err;
              return null;
            })
          : Promise.resolve(null),
      ]);

      const toSide = ({ side, tables }: { side: ResolvedSide; tables: Awaited<ReturnType<WclProvider['sideTables']>> }): FightSide => ({
        timeline: tables.timeline,
        taken: tables.taken,
        prep: tables.prep,
        name: side.name,
        server: side.server,
        amount: side.total,
        perSecond: side.total / ((side.endTime - side.startTime) / 1000),
        durationMs: side.endTime - side.startTime,
        activeTime: side.activeTime,
        reportCode: side.code,
        fightId: side.fightId,
      });

      return {
        encounter,
        metric,
        className: kill.cls.name,
        spec,
        you: toSide(you),
        ref: top ? toSide(top) : null,
        abilities: compareAbilities(you.tables, top?.tables ?? { durationMs: 1, amounts: [], casts: [] }),
        updatedAt: Date.now(),
        weeks: weeks.map(({ week: w, perSecond, rankPercent }) => ({ week: w, perSecond, rankPercent })),
        week: week ?? null,
        benchmark,
      };
    });
  }

  /**
   * Downloads p50/p99 benchmarks for one class + spec across the given raids, skipping what is
   * already saved. Stops cleanly when the hourly allowance runs low; run again later to continue.
   */
  async syncBenchmarks(
    className: string,
    spec: string,
    raidIds?: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ fetched: number; skipped: number; remaining: number }> {
    const cls = Object.values(CLASSES).find((c) => c.name.toLowerCase() === className.toLowerCase());
    if (!cls) throw new ApiFailure('bad_request', `Unknown class "${className}".`);
    const specName = cls.specs.find((sp) => sp.toLowerCase() === spec.toLowerCase());
    if (!specName) throw new ApiFailure('bad_request', `${cls.name} has no spec "${spec}". Try: ${cls.specs.join(', ')}.`);
    const raids = (await this.raids()).filter((r) => !raidIds?.length || raidIds.includes(r.id));
    const metric = metricFor(cls.name, specName);
    const keys = raids.flatMap((r) => r.encounters.map((e) => ({ encounterId: e.id, className: cls.name, spec: specName, metric })));
    const todo = keys.filter((k) => this.cache.peek(`bench|${keyString(k)}`) === undefined);
    const BATCH = 6;
    let fetched = 0;
    for (let i = 0; i < todo.length; i += BATCH) {
      try {
        const batch = todo.slice(i, i + BATCH);
        await this.fetchBenchmarks(new Map(batch.map((k) => [keyString(k), k])));
      } catch (err) {
        if (err instanceof ApiFailure && err.code === 'rate_limited') break;
        throw err;
      }
      fetched += Math.min(BATCH, todo.length - i);
      onProgress?.(fetched, todo.length);
    }
    this.cache.flush();
    return { fetched, skipped: keys.length - todo.length, remaining: todo.length - fetched };
  }
}
