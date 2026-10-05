import { REALMS, type Benchmark, type Comparison, type Raid, type ZoneReport } from '../../shared/types.js';
import { compareAbilities, type SideTables } from '../core/compare.js';
import type { CharacterRef } from '../core/input.js';
import { buildRow, summarise } from '../core/report.js';
import { raidsFromZones } from '../core/raids.js';
import { TBC_ZONES } from '../core/zones.js';
import { ApiFailure } from '../errors.js';
import type { Provider } from '../provider.js';

/** Small deterministic PRNG so demo numbers are stable between reloads. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rough Fury Warrior p99 DPS by raid tier. */
const TIER_P99: Record<number, number> = { 1007: 1450, 1008: 1620, 1010: 1930, 1011: 2310, 1012: 2140, 1013: 2860 };
/** Bosses the demo character has not killed yet. */
const UNKILLED = new Set([728, 729]);

const SPEC = 'Fury';
const realmName = (slug: string) => REALMS.find((r) => r.slug === slug)?.name ?? slug;
const CLASS = 'Warrior';

function benchmarkFor(zoneId: number, encounterId: number): Benchmark {
  const r = rng(encounterId * 7919);
  const p99 = Math.round(TIER_P99[zoneId] * (0.88 + r() * 0.24));
  return {
    encounterId,
    className: CLASS,
    spec: SPEC,
    metric: 'dps',
    sampleSize: Math.round(1800 + r() * 5200),
    p50: Math.round(p99 * (0.64 + r() * 0.08)),
    p99,
    reference: {
      name: ['Thrandok', 'Velgrim', 'Kasmir', 'Orrek', 'Brugal'][encounterId % 5],
      server: ['Dreamscythe', 'Nightslayer', 'Spineshatter', 'Thunderstrike'][encounterId % 4],
      amount: p99,
      durationMs: Math.round((95 + r() * 260) * 1000),
      reportCode: 'demo',
      fightId: encounterId,
    },
  };
}

/** Percentile from a position between p50 and p99, roughly matching WCL's curve. */
function parseFor(best: number, b: Benchmark): number {
  if (best >= b.p99) return Math.min(100, 99 + (best - b.p99) / (b.p99 * 0.06));
  if (best >= b.p50) return 50 + ((best - b.p50) / (b.p99 - b.p50)) * 49;
  return Math.max(1, (best / b.p50) * 50);
}

const ABILITIES = [
  { guid: 1, name: 'Melee', abilityIcon: 'inv_sword_04.jpg', share: 0.47, cpm: 0 },
  { guid: 30335, name: 'Bloodthirst', abilityIcon: 'spell_nature_bloodlust.jpg', share: 0.17, cpm: 9.6 },
  { guid: 1680, name: 'Whirlwind', abilityIcon: 'ability_whirlwind.jpg', share: 0.12, cpm: 5.4 },
  { guid: 29707, name: 'Heroic Strike', abilityIcon: 'ability_rogue_ambush.jpg', share: 0.1, cpm: 14.2 },
  { guid: 25584, name: 'Windfury Attack', abilityIcon: 'spell_nature_windfury.jpg', share: 0.06, cpm: 0 },
  { guid: 25236, name: 'Execute', abilityIcon: 'inv_sword_48.jpg', share: 0.05, cpm: 2.1 },
  { guid: 12867, name: 'Deep Wounds', abilityIcon: 'ability_backstab.jpg', share: 0.03, cpm: 0 },
  { guid: 25212, name: 'Hamstring', abilityIcon: 'ability_shockwave.jpg', share: 0, cpm: 1.4 },
  { guid: 30033, name: 'Rampage', abilityIcon: 'ability_warrior_rampage.jpg', share: 0, cpm: 1.1 },
];

function tables(total: number, durationMs: number, seed: number, skew: number): SideTables {
  const r = rng(seed);
  const minutes = durationMs / 60000;
  const weights = ABILITIES.map((a, i) => a.share * (1 + (r() - 0.5) * 0.3 + (i === 3 ? skew : 0) - (i === 0 ? skew / 2 : 0)));
  const sum = weights.reduce((a, b) => a + b, 0);
  return {
    durationMs,
    amounts: ABILITIES.filter((a) => a.share > 0).map((a) => ({ ...a, total: Math.round((total * weights[ABILITIES.indexOf(a)]) / sum) })),
    casts: ABILITIES.filter((a) => a.cpm > 0).map((a) => ({ ...a, total: Math.round(a.cpm * minutes * (1 + (r() - 0.5) * 0.2 - skew)) })),
  };
}

export class DemoProvider implements Provider {
  readonly site = 'fresh' as const;
  readonly demo = true;

  status() {
    return null;
  }

  private readonly allRaids = raidsFromZones(TBC_ZONES);

  async raids(): Promise<Raid[]> {
    return this.allRaids;
  }


  private bestFor(name: string, encounterId: number, b: Benchmark): number | null {
    if (UNKILLED.has(encounterId)) return null;
    const r = rng(encounterId * 31 + name.length * 977);
    return Math.round(b.p99 * (0.74 + r() * 0.31));
  }

  async zoneReport(ref: CharacterRef, raidId?: string): Promise<ZoneReport> {
    const raid = raidId ? this.allRaids.find((r) => r.id === raidId) : this.allRaids[this.allRaids.length - 1];
    if (!raid) throw new ApiFailure('not_found', `Unknown raid "${raidId}".`);
    const rows = raid.encounters.map((encounter) => {
      const b = benchmarkFor(raid.zoneId, encounter.id);
      const best = this.bestFor(ref.name, encounter.id, b);
      return buildRow(
        encounter,
        SPEC,
        'dps',
        best == null
          ? undefined
          : { encounterId: encounter.id, spec: SPEC, kills: 1 + (encounter.id % 9), best, rankPercent: parseFor(best, b) },
        b,
      );
    });
    return {
      character: { name: ref.name, realm: ref.realm, realmName: realmName(ref.realm), region: ref.region, className: CLASS },
      raid,
      rows,
      summary: summarise(rows),
      updatedAt: Date.now() - 25 * 60_000,
    };
  }

  async compare(ref: CharacterRef, encounterId: number, spec: string): Promise<Comparison> {
    const zone = TBC_ZONES.find((z) => z.encounters.some((e) => e.id === encounterId));
    if (!zone || spec !== SPEC) throw new ApiFailure('not_found', 'No kill for that boss in the demo data.');
    const encounter = zone.encounters.find((e) => e.id === encounterId)!;
    const b = benchmarkFor(zone.id, encounterId);
    const best = this.bestFor(ref.name, encounterId, b);
    if (best == null) throw new ApiFailure('not_found', `${ref.name} has no ranked ${spec} kill on ${encounter.name}.`);

    const refDuration = b.reference.durationMs;
    const youDuration = Math.round(refDuration * 1.08);
    const youTables = tables(best * (youDuration / 1000), youDuration, encounterId, 0.12);
    const refTables = tables(b.p99 * (refDuration / 1000), refDuration, encounterId + 1, 0);
    const sum = (t: SideTables) => t.amounts.reduce((a, e) => a + e.total, 0);
    return {
      encounter,
      metric: 'dps',
      className: CLASS,
      spec,
      you: { name: ref.name, server: realmName(ref.realm), amount: sum(youTables), perSecond: best, durationMs: youDuration, activeTime: 0.952, reportCode: 'demo', fightId: 1 },
      ref: { name: b.reference.name, server: b.reference.server, amount: sum(refTables), perSecond: b.p99, durationMs: refDuration, activeTime: 0.991, reportCode: 'demo', fightId: 1 },
      abilities: compareAbilities(youTables, refTables),
      updatedAt: Date.now() - 3 * 60 * 60_000,
    };
  }
}
