import type { Benchmark, Comparison, FightSide, Metric, Site, Zone, ZoneReport } from '../../shared/types.js';
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
import { classById, metricFor } from '../core/classes.js';
import { compareAbilities, type TableEntry } from '../core/compare.js';
import type { CharacterRef } from '../core/input.js';
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
      server: { name: string; slug: string; region: { slug: string } };
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

const SAFE_NAME = /^[A-Za-z]+$/;

export class WclProvider implements Provider {
  readonly demo = false;
  private readonly cache = new TtlCache();
  private readonly benchmarks = new Map<string, { expires: number; value: Benchmark | null }>();

  constructor(private readonly client: WclClient, readonly site: Site) {}

  zones(): Promise<Zone[]> {
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

  async zoneReport(ref: CharacterRef, zoneId?: number): Promise<ZoneReport> {
    const zones = await this.zones();
    const zone = zoneId ? zones.find((z) => z.id === zoneId) : zones[zones.length - 1];
    if (!zone) throw new ApiFailure('not_found', `Unknown raid id ${zoneId}.`);

    const character = await this.cache.get(`char|${ref.region}|${ref.realm}|${ref.name}|${zone.id}`, 10 * MINUTE, () =>
      this.client.query<CharacterResponse>(
        `query($name: String!, $server: String!, $region: String!, $zone: Int!) {
          characterData { character(name: $name, serverSlug: $server, serverRegion: $region) {
            name classID server { name slug region { slug } }
            dps: zoneRankings(zoneID: $zone, metric: dps)
            hps: zoneRankings(zoneID: $zone, metric: hps)
          } }
        }`,
        { name: ref.name, server: ref.realm, region: ref.region, zone: zone.id },
      ),
    );
    const c = character.characterData.character;
    if (!c) throw new ApiFailure('not_found', `No character "${ref.name}" on ${ref.realm} (${ref.region}).`);
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

    const plan = zone.encounters.map((encounter) => {
      const seen = sets.dps.get(encounter.id);
      const spec = seen?.spec && seen.totalKills ? seen.spec : main;
      const metric = metricFor(cls.name, spec);
      const best = sets[metric].get(encounter.id);
      return { encounter, spec, metric, best: best ? toBest(best) : undefined };
    });

    const benchmarks = await this.getBenchmarks(
      plan.map((p) => ({ encounterId: p.encounter.id, className: cls.name, spec: p.spec, metric: p.metric })),
    );
    const rows = plan.map((p) =>
      buildRow(p.encounter, p.spec, p.metric, p.best, benchmarks.get(keyString({ encounterId: p.encounter.id, className: cls.name, spec: p.spec, metric: p.metric })) ?? null),
    );

    return {
      character: { name: c.name, realm: c.server.slug, realmName: c.server.name, region: ref.region, className: cls.name },
      zone,
      rows,
      summary: summarise(rows),
    };
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

  async compare(ref: CharacterRef, encounterId: number, spec: string): Promise<Comparison> {
    if (!SAFE_NAME.test(spec)) throw new ApiFailure('bad_request', 'Invalid spec.');
    const zones = await this.zones();
    const encounter = zones.flatMap((z) => z.encounters).find((e) => e.id === encounterId);
    if (!encounter) throw new ApiFailure('not_found', `Unknown encounter ${encounterId}.`);

    const lookup = await this.client.query<{
      characterData: { character: null | { name: string; classID: number; server: { name: string }; dps: EncounterRanks | null; hps: EncounterRanks | null } };
    }>(
      `query($name: String!, $server: String!, $region: String!, $enc: Int!, $spec: String!) {
        characterData { character(name: $name, serverSlug: $server, serverRegion: $region) {
          name classID server { name }
          dps: encounterRankings(encounterID: $enc, metric: dps, specName: $spec)
          hps: encounterRankings(encounterID: $enc, metric: hps, specName: $spec)
        } }
      }`,
      { name: ref.name, server: ref.realm, region: ref.region, enc: encounterId, spec },
    );
    const c = lookup.characterData.character;
    if (!c) throw new ApiFailure('not_found', `No character "${ref.name}" on ${ref.realm} (${ref.region}).`);
    const cls = classById(c.classID);
    if (!cls) throw new ApiFailure('bad_request', `${c.name} is not a TBC class.`);
    const metric = metricFor(cls.name, spec);
    const bestKill = [...(c[metric]?.ranks ?? [])].sort((a, b) => b.amount - a.amount)[0];
    if (!bestKill) throw new ApiFailure('not_found', `${c.name} has no ranked ${spec} kill on ${encounter.name}.`);

    const key = { encounterId, className: cls.name, spec, metric };
    const benchmark = (await this.getBenchmarks([key])).get(keyString(key));
    if (!benchmark) throw new ApiFailure('not_found', `No ranked ${spec} ${cls.name} parses on ${encounter.name} yet.`);

    const sides = [
      { name: c.name, server: c.server.name, code: bestKill.report.code, fight: bestKill.report.fightID },
      { name: benchmark.reference.name, server: benchmark.reference.server, code: benchmark.reference.reportCode, fight: benchmark.reference.fightId },
    ];
    const dataType = metric === 'hps' ? 'Healing' : 'DamageDone';

    // Pass 1: fight bounds and the player-level table (gives source id + active time).
    const overview = await this.cache.get(`ov|${sides.map((s) => `${s.code}:${s.fight}`).join('|')}|${dataType}`, 24 * HOUR, () =>
      this.client.query<Record<string, { report: { fights: { id: number; startTime: number; endTime: number }[]; players: ReportTable } }>>(
        `query($c0: String!, $f0: Int!, $c1: String!, $f1: Int!) {
          r0: reportData { report(code: $c0) { fights(fightIDs: [$f0]) { id startTime endTime } players: table(dataType: ${dataType}, fightIDs: [$f0]) } }
          r1: reportData { report(code: $c1) { fights(fightIDs: [$f1]) { id startTime endTime } players: table(dataType: ${dataType}, fightIDs: [$f1]) } }
        }`,
        { c0: sides[0].code, f0: sides[0].fight, c1: sides[1].code, f1: sides[1].fight },
      ),
    );

    const resolved = sides.map((s, i) => {
      const report = overview[`r${i}`]?.report;
      const fight = report?.fights[0];
      const player = report?.players.data?.entries?.find((e) => e.name === s.name);
      if (!fight || !player?.id) throw new ApiFailure('upstream', `Could not find ${s.name} in report ${s.code}.`);
      const durationMs = fight.endTime - fight.startTime;
      const totalTime = report.players.data?.totalTime || durationMs;
      return { ...s, fight, sourceId: player.id, total: player.total, durationMs, activeTime: player.activeTime != null ? player.activeTime / totalTime : null };
    });

    // Pass 2: per-ability amounts and casts for each player.
    const tables = await this.cache.get(`tb|${resolved.map((s) => `${s.code}:${s.fight.id}:${s.sourceId}`).join('|')}|${dataType}`, 24 * HOUR, () =>
      this.client.query<Record<string, { report: { amounts: ReportTable; casts: ReportTable } }>>(
        `query(${resolved.map((_, i) => `$c${i}: String!, $f${i}: Int!, $s${i}: Int!, $a${i}: Float!, $b${i}: Float!`).join(', ')}) {
          ${resolved
            .map(
              (_, i) => `r${i}: reportData { report(code: $c${i}) {
                amounts: table(dataType: ${dataType}, fightIDs: [$f${i}], sourceID: $s${i}, startTime: $a${i}, endTime: $b${i})
                casts: table(dataType: Casts, fightIDs: [$f${i}], sourceID: $s${i}, startTime: $a${i}, endTime: $b${i})
              } }`,
            )
            .join('\n')}
        }`,
        Object.fromEntries(
          resolved.flatMap((s, i) => [
            [`c${i}`, s.code],
            [`f${i}`, s.fight.id],
            [`s${i}`, s.sourceId],
            [`a${i}`, s.fight.startTime],
            [`b${i}`, s.fight.endTime],
          ]),
        ),
      ),
    );

    const sideTables = resolved.map((_, i) => ({
      durationMs: resolved[i].durationMs,
      amounts: tables[`r${i}`]?.report.amounts.data?.entries ?? [],
      casts: tables[`r${i}`]?.report.casts.data?.entries ?? [],
    }));
    const side = (i: number): FightSide => ({
      name: resolved[i].name,
      server: resolved[i].server,
      amount: resolved[i].total,
      perSecond: resolved[i].total / (resolved[i].durationMs / 1000),
      durationMs: resolved[i].durationMs,
      activeTime: resolved[i].activeTime,
      reportCode: resolved[i].code,
      fightId: resolved[i].fight.id,
    });

    return {
      encounter,
      metric,
      className: cls.name,
      spec,
      you: side(0),
      ref: side(1),
      abilities: compareAbilities(sideTables[0], sideTables[1]),
    };
  }
}
