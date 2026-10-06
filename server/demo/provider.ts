import { REALMS, type Benchmark, type Comparison, type Raid, type ZoneReport } from '../../shared/types.js';
import { compareAbilities, type SideTables } from '../core/compare.js';
import { weekStart } from '../core/fight.js';
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
const WARRIOR_SPECS = ['Arms', 'Fury', 'Protection'];
const realmName = (slug: string) => REALMS.find((r) => r.slug === slug)?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1);
const CLASS = 'Warrior';

/** Rough DPS of each Warrior spec relative to Fury. */
const SPEC_SCALE: Record<string, number> = { Fury: 1, Arms: 0.9, Protection: 0.52 };

function benchmarkFor(zoneId: number, encounterId: number, spec = SPEC): Benchmark {
  const r = rng(encounterId * 7919 + spec.length);
  const p99 = Math.round(TIER_P99[zoneId] * (SPEC_SCALE[spec] ?? 1) * (0.88 + r() * 0.24));
  return {
    encounterId,
    className: CLASS,
    spec,
    metric: 'dps',
    sampleSize: Math.round(1800 + r() * 5200),
    p50: Math.round(p99 * (0.64 + r() * 0.08)),
    p99,
    ladder: [10, 25, 50, 75, 90, 95, 99].map((pct) => ({ percentile: pct, amount: Math.round(p99 * (0.32 + 0.68 * Math.pow(pct / 99, 1.6))) })),
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

  async characterNames(): Promise<string[]> {
    return ['Brannoc', 'Kaelthys', 'Morwenna', 'Thalric', 'Velindra'];
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

  async refresh(ref: CharacterRef, raidId?: string, spec?: string): Promise<ZoneReport> {
    return { ...(await this.zoneReport(ref, raidId, spec)), updatedAt: Date.now() };
  }

  async zoneReport(ref: CharacterRef, raidId?: string, spec?: string): Promise<ZoneReport> {
    const shown = spec && WARRIOR_SPECS.includes(spec) ? spec : SPEC;
    const raid = raidId ? this.allRaids.find((r) => r.id === raidId) : this.allRaids[this.allRaids.length - 1];
    if (!raid) throw new ApiFailure('not_found', `Unknown raid "${raidId}".`);
    const rows = raid.encounters.map((encounter) => {
      const b = benchmarkFor(raid.zoneId, encounter.id, shown);
      const best = this.bestFor(ref.name + shown, encounter.id, b);
      return buildRow(
        encounter,
        shown,
        'dps',
        best == null
          ? undefined
          : { encounterId: encounter.id, spec: shown, kills: 1 + (encounter.id % 9), best, rankPercent: parseFor(best, b) },
        b,
      );
    });
    return {
      character: { name: ref.name, realm: ref.realm, realmName: realmName(ref.realm), region: ref.region, className: CLASS, race: 'Orc' },
      raid,
      rows,
      summary: summarise(rows),
      updatedAt: Date.now() - 25 * 60_000,
      spec: spec ?? null,
      mainSpec: shown,
      specs: WARRIOR_SPECS,
    };
  }

  async compare(ref: CharacterRef, encounterId: number, spec: string, week?: number): Promise<Comparison> {
    const zone = TBC_ZONES.find((z) => z.encounters.some((e) => e.id === encounterId));
    if (!zone || !WARRIOR_SPECS.includes(spec)) throw new ApiFailure('not_found', 'No kill for that boss in the demo data.');
    const encounter = zone.encounters.find((e) => e.id === encounterId)!;
    const b = benchmarkFor(zone.id, encounterId, spec);
    const bestOverall = this.bestFor(ref.name + spec, encounterId, b);
    if (bestOverall == null) throw new ApiFailure('not_found', `${ref.name} has no ranked ${spec} kill on ${encounter.name}.`);

    // Eight raid weeks of steady improvement towards the overall best.
    const lastReset = weekStart(Date.now());
    const wr = rng(encounterId * 13 + ref.name.length);
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const perSecond = Math.round(bestOverall * (0.78 + (i / 7) * 0.2 + (wr() - 0.5) * 0.04));
      return { week: lastReset - (7 - i) * 7 * 86_400_000, perSecond, rankPercent: parseFor(perSecond, b) };
    });
    weeks[weeks.length - 2].perSecond = bestOverall; // the best kill was last week
    weeks[weeks.length - 2].rankPercent = parseFor(bestOverall, b);
    const chosen = week ? weeks.find((w) => w.week === week) : undefined;
    if (week && !chosen) throw new ApiFailure('not_found', `${ref.name} has no ranked ${spec} kill on ${encounter.name} that week.`);
    const best = chosen?.perSecond ?? bestOverall;

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
      you: {
        name: ref.name,
        server: realmName(ref.realm),
        amount: sum(youTables),
        perSecond: best,
        durationMs: youDuration,
        activeTime: 0.952,
        reportCode: 'demo',
        fightId: 1,
        timeline: demoTimeline(sum(youTables), youDuration, encounterId, 0.9),
        taken: demoTaken(encounterId, 1.08),
        prep: { flask: 0.91, food: 1, potions: 1 },
      },
      ref: {
        name: b.reference.name,
        server: b.reference.server,
        amount: sum(refTables),
        perSecond: b.p99,
        durationMs: refDuration,
        activeTime: 0.991,
        reportCode: 'demo',
        fightId: 1,
        timeline: demoTimeline(sum(refTables), refDuration, encounterId + 1, 1.05),
        taken: demoTaken(encounterId + 1, 1),
        prep: { flask: 1, food: 1, potions: 2 },
      },
      abilities: compareAbilities(youTables, refTables),
      updatedAt: Date.now() - 3 * 60 * 60_000,
      weeks,
      week: week ?? null,
      benchmark: b,
    };
  }
}

/** Running damage total in 15-second steps; `burst` > 1 front-loads it (cooldowns on the pull). */
function demoTimeline(total: number, durationMs: number, seed: number, burst: number) {
  const r = rng(seed);
  const steps = Math.ceil(durationMs / 15_000);
  const weights = Array.from({ length: steps }, (_, i) => (i < 2 ? burst : 1) * (0.85 + r() * 0.3) * (i === steps - 1 ? 1.15 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  let run = 0;
  return { stepMs: 15_000, cumulative: [0, ...weights.map((w) => Math.round(((run += w) / sum) * total))] };
}

/** Damage taken per second by school for a Black Temple-like fight. */
function demoTaken(seed: number, scale: number) {
  const r = rng(seed * 3);
  return [
    { school: 'Physical', perSecond: Math.round((40 + r() * 30) * scale) },
    { school: 'Fire', perSecond: Math.round((15 + r() * 25) * scale) },
    { school: 'Shadow', perSecond: Math.round((20 + r() * 40) * scale) },
    { school: 'Nature', perSecond: Math.round((5 + r() * 15) * scale) },
  ];
}
