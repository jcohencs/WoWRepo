import type { Benchmark, Comparison, FightSide, Metric, Raid, Realm, Region, Site, Zone, ZoneReport } from '../../shared/types.js';
import { HOUR, MINUTE, TtlCache } from '../cache.js';
import {
  buildBenchmark,
  keyString,
  pagesNeeded,
  rankingCount,
  type BenchmarkKey,
  type RawRanking,
  type RawRankingPage,
} from '../core/benchmark.js';
import { classById, metricFor, metricForSpec, type ClassInfo } from '../core/classes.js';
import { compareAbilities, type TableEntry } from '../core/compare.js';
import type { CharacterRef } from '../core/input.js';
import { raidsFromZones } from '../core/raids.js';
import { FALLBACK_REALMS, realmList, sortRealms } from '../core/realms.js';
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
  ranks?: { amount: number; duration: number; spec?: string; report: { code: string; fightID: number } }[];
}

interface ReportTable {
  data?: { totalTime?: number; entries?: (TableEntry & { id?: number; activeTime?: number })[] };
}

/** The character's best kill on one encounter, as needed by the comparison. */
interface BestKill {
  name: string;
  server: string;
  cls: ClassInfo;
  code: string;
  fight: number;
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

const bestKillFrom = (ranks: EncounterRanks | null | undefined) =>
  [...(ranks?.ranks ?? [])].sort((a, b) => b.amount - a.amount)[0];

export class WclProvider implements Provider {
  readonly demo = false;
  private readonly cache = new TtlCache();
  private readonly benchmarks = new Map<string, { expires: number; value: Benchmark | null }>();

  constructor(private readonly client: WclClient, readonly site: Site) {}

  private zones(): Promise<Zone[]> {
    return this.cache.get('zones', 24 * HOUR, async () => {
      try {
        const data = await this.client.query<{ worldData: { expansions: Parameters<typeof tbcZonesFromExpansions>[0] } }>(
          `{ worldData { expansions { id name zones { id name frozen encounters { id name } } } } }`,
        );
        const zones = tbcZonesFromExpansions(data.worldData.expansions);
        return zones.length ? zones : TBC_ZONES;
      } catch (err) {
        if (err instanceof ApiFailure && err.code === 'config') throw err;
        return TBC_ZONES;
      }
    });
  }

  async raids(): Promise<Raid[]> {
    return raidsFromZones(await this.zones());
  }

  realms(region: Region): Promise<Realm[]> {
    return this.cache.get(`realms|${region}`, 24 * HOUR, async () => {
      const fallback = realmList(FALLBACK_REALMS[this.site][region] ?? []);
      try {
        type Page = { last_page?: number; data: Realm[] };
        const first = await this.client.query<{ worldData: { regions: { id: number; slug: string; servers: Page }[] } }>(
          `{ worldData { regions { id slug servers(limit: 100, page: 1) { last_page data { name slug } } } } }`,
        );
        const match = first.worldData.regions.find((r) => r.slug.toUpperCase() === region);
        if (!match) return fallback;
        const realms = [...match.servers.data];
        const last = Math.min(match.servers.last_page ?? 1, 15);
        if (last > 1) {
          const pages = Array.from({ length: last - 1 }, (_, i) => i + 2);
          const more = await this.client.query<{ worldData: Record<string, { servers: Page }> }>(
            `{ worldData { ${pages.map((p) => `p${p}: region(id: ${match.id}) { servers(limit: 100, page: ${p}) { data { name slug } } }`).join('\n')} } }`,
          );
          for (const p of pages) realms.push(...(more.worldData[`p${p}`]?.servers.data ?? []));
        }
        return realms.length ? sortRealms(realms) : fallback;
      } catch (err) {
        if (err instanceof ApiFailure && err.code === 'config') throw err;
        return fallback;
      }
    });
  }

  async zoneReport(ref: CharacterRef, raidId?: string): Promise<ZoneReport> {
    const raids = await this.raids();
    const raid = raidId ? raids.find((r) => r.id === raidId) : raids[raids.length - 1];
    if (!raid) throw new ApiFailure('not_found', `Unknown raid "${raidId}".`);

    const character = await this.cache.get(`char|${ref.region}|${ref.realm}|${ref.name}|${raid.zoneId}`, 10 * MINUTE, () =>
      this.client.query<CharacterResponse>(
        `query($name: String!, $server: String!, $region: String!, $zone: Int!) {
          characterData { character(name: $name, serverSlug: $server, serverRegion: $region) {
            name classID server { name slug }
            dps: zoneRankings(zoneID: $zone, metric: dps)
            hps: zoneRankings(zoneID: $zone, metric: hps)
          } }
        }`,
        { name: ref.name, server: ref.realm, region: ref.region, zone: raid.zoneId },
      ),
    );
    const c = character.characterData.character;
    if (!c) throw new ApiFailure('not_found', `Couldn't find "${ref.name}" on ${ref.realm} (${ref.region}). Check the spelling and realm.`);
    const cls = classById(c.classID);
    if (!cls) throw new ApiFailure('bad_request', `${c.name} is not a TBC class.`);

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
      const spec = seen?.spec && seen.totalKills ? seen.spec : main;
      const metric = metricFor(cls.name, spec);
      const best = sets[metric].get(encounter.id);
      return { encounter, spec, metric, best: best ? toBest(best) : undefined };
    });
    const keyOf = (p: (typeof plan)[number]): BenchmarkKey => ({ encounterId: p.encounter.id, className: cls.name, spec: p.spec, metric: p.metric });

    const benchmarks = await this.getBenchmarks(plan.map(keyOf));
    const rows = plan.map((p) => buildRow(p.encounter, p.spec, p.metric, p.best, benchmarks.get(keyString(keyOf(p))) ?? null));

    // Warm the best-kill lookups in the background so opening a comparison skips that round trip.
    const killed = plan.filter((p) => p.best && p.best.kills > 0 && SAFE_NAME.test(p.spec));
    if (killed.length) void this.warmBestKills(ref, cls, c.name, c.server.name, killed).catch(() => undefined);

    return {
      character: { name: c.name, realm: c.server.slug, realmName: c.server.name, region: ref.region, className: cls.name },
      raid,
      rows,
      summary: summarise(rows),
    };
  }

  private bestKillKey(ref: CharacterRef, encounterId: number, spec: string, metric: Metric) {
    return `best|${ref.region}|${ref.realm}|${ref.name}|${encounterId}|${spec}|${metric}`;
  }

  /** One aliased query fetching the best-kill report for every killed boss. */
  private async warmBestKills(
    ref: CharacterRef,
    cls: ClassInfo,
    name: string,
    server: string,
    items: { encounter: { id: number }; spec: string; metric: Metric }[],
  ) {
    const load = this.client.query<{ characterData: { character: Record<string, EncounterRanks | null> | null } }>(
      `query($name: String!, $server: String!, $region: String!) {
        characterData { character(name: $name, serverSlug: $server, serverRegion: $region) {
          ${items.map((it, i) => `e${i}: encounterRankings(encounterID: ${it.encounter.id}, metric: ${it.metric}, specName: "${it.spec}")`).join('\n')}
        } }
      }`,
      { name: ref.name, server: ref.realm, region: ref.region },
    );
    items.forEach((it, i) => {
      void this.cache
        .get(this.bestKillKey(ref, it.encounter.id, it.spec, it.metric), 10 * MINUTE, async () => {
          const kill = bestKillFrom((await load).characterData.character?.[`e${i}`]);
          return kill ? ({ name, server, cls, code: kill.report.code, fight: kill.report.fightID } satisfies BestKill) : null;
        })
        .catch(() => undefined);
    });
    await load;
  }

  private bestKill(ref: CharacterRef, encounterId: number, spec: string, metric: Metric): Promise<BestKill | null> {
    return this.cache.get(this.bestKillKey(ref, encounterId, spec, metric), 10 * MINUTE, async () => {
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
      const kill = bestKillFrom(c.ranks);
      return kill ? { name: c.name, server: c.server.name, cls, code: kill.report.code, fight: kill.report.fightID } : null;
    });
  }

  /** Two batched queries: page 1 for every key, then the pages holding p50/p99. */
  private async getBenchmarks(keys: BenchmarkKey[]): Promise<Map<string, Benchmark | null>> {
    const now = Date.now();
    const result = new Map<string, Benchmark | null>();
    const missing = new Map<string, BenchmarkKey>();
    for (const k of keys) {
      const id = keyString(k);
      const hit = this.benchmarks.get(id);
      if (hit && hit.expires > now) result.set(id, hit.value);
      else if (SAFE_NAME.test(k.className) && SAFE_NAME.test(k.spec)) missing.set(id, k);
    }
    if (!missing.size) return result;

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
      this.benchmarks.set(id, { expires: now + 6 * HOUR, value });
      result.set(id, value);
    }
    return result;
  }

  /** Finds the player in the fight and reads fight bounds, total and active time. Reports never change, so cache long. */
  private resolveSide(code: string, fightId: number, name: string, server: string, dataType: string): Promise<ResolvedSide> {
    return this.cache.get(`side|${code}|${fightId}|${name}|${dataType}`, 24 * HOUR, async () => {
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

  private sideTables(s: ResolvedSide, dataType: string) {
    return this.cache.get(`tables|${s.code}|${s.fightId}|${s.sourceId}|${dataType}`, 24 * HOUR, async () => {
      const data = await this.client.query<{ reportData: { report: { amounts: ReportTable; casts: ReportTable } } }>(
        `query($code: String!, $fight: Int!, $source: Int!, $start: Float!, $end: Float!) {
          reportData { report(code: $code) {
            amounts: table(dataType: ${dataType}, fightIDs: [$fight], sourceID: $source, startTime: $start, endTime: $end)
            casts: table(dataType: Casts, fightIDs: [$fight], sourceID: $source, startTime: $start, endTime: $end)
          } }
        }`,
        { code: s.code, fight: s.fightId, source: s.sourceId, start: s.startTime, end: s.endTime },
      );
      return {
        durationMs: s.endTime - s.startTime,
        amounts: data.reportData.report.amounts.data?.entries ?? [],
        casts: data.reportData.report.casts.data?.entries ?? [],
      };
    });
  }

  async compare(ref: CharacterRef, encounterId: number, spec: string): Promise<Comparison> {
    if (!SAFE_NAME.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');
    const raids = await this.raids();
    const encounter = raids.flatMap((r) => r.encounters).find((e) => e.id === encounterId);
    if (!encounter) throw new ApiFailure('not_found', `Unknown encounter ${encounterId}.`);

    return this.cache.get(`compare|${ref.region}|${ref.realm}|${ref.name}|${encounterId}|${spec}`, 10 * MINUTE, async () => {
      const metric = metricForSpec(spec);
      const kill = await this.bestKill(ref, encounterId, spec, metric);
      if (!kill) throw new ApiFailure('not_found', `${ref.name} has no ranked ${spec} kill on ${encounter.name}.`);

      const key = { encounterId, className: kill.cls.name, spec, metric };
      const benchmark = (await this.getBenchmarks([key])).get(keyString(key));
      if (!benchmark) throw new ApiFailure('not_found', `No ranked ${spec} ${kill.cls.name} logs on ${encounter.name} yet.`);
      const dataType = metric === 'hps' ? 'Healing' : 'DamageDone';

      // Both sides load in parallel; each is two small queries, cached per report.
      const load = async (code: string, fight: number, name: string, server: string) => {
        const side = await this.resolveSide(code, fight, name, server, dataType);
        return { side, tables: await this.sideTables(side, dataType) };
      };
      const [you, top] = await Promise.all([
        load(kill.code, kill.fight, kill.name, kill.server),
        load(benchmark.reference.reportCode, benchmark.reference.fightId, benchmark.reference.name, benchmark.reference.server),
      ]);

      const toSide = ({ side }: { side: ResolvedSide }): FightSide => ({
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
        ref: toSide(top),
        abilities: compareAbilities(you.tables, top.tables),
      };
    });
  }
}
