import type { Preparation, SchoolTotal, WeekPoint } from '../../shared/types.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;
/** US raid reset: Tuesday 15:00 UTC. A known reset to count weeks from. */
const US_RESET_ANCHOR = Date.UTC(2024, 0, 2, 15); // Tue 2 Jan 2024 15:00 UTC

/** Start (epoch ms) of the raid week containing `ts`. */
export function weekStart(ts: number): number {
  return US_RESET_ANCHOR + Math.floor((ts - US_RESET_ANCHOR) / WEEK) * WEEK;
}

/** One ranked kill of a boss, as returned by `encounterRankings`. */
export interface Kill {
  startTime: number;
  /** DPS / HPS of the kill. */
  amount: number;
  rankPercent: number | null;
  code: string;
  fight: number;
}

/** Best kill per raid week, oldest week first. */
export function bestPerWeek(kills: Kill[]): (WeekPoint & { kill: Kill })[] {
  const byWeek = new Map<number, Kill>();
  for (const k of kills) {
    const w = weekStart(k.startTime);
    const cur = byWeek.get(w);
    if (!cur || k.amount > cur.amount) byWeek.set(w, k);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, kill]) => ({ week, perSecond: kill.amount, rankPercent: kill.rankPercent, kill }));
}

type Point = number | [number, number] | { x: number; y: number };
interface GraphSeries {
  name?: string;
  pointStart?: number;
  pointInterval?: number;
  data?: Point[];
}

/**
 * Running total over the fight from a Warcraft Logs `graph` response. Only the *shape* of the
 * graph is used: the curve is scaled so it ends at `total` (the exact amount from the table), so
 * the numbers stay correct whatever unit the graph points are in.
 */
export function timelineFromGraph(
  graph: unknown,
  total: number,
  durationMs: number,
  stepMs = 15_000,
): { stepMs: number; cumulative: number[] } | undefined {
  const series = ((graph as { data?: { series?: GraphSeries[] } })?.data?.series ?? []).filter((s) => Array.isArray(s.data) && s.data.length);
  if (!series.length || durationMs <= 0 || total <= 0) return undefined;
  const picked = series.filter((s) => /total/i.test(s.name ?? ''));
  const use = picked.length ? picked.slice(0, 1) : series;

  // Accumulate every point into fixed time buckets, measured from the series' first point.
  const buckets = new Array(Math.max(1, Math.ceil(durationMs / stepMs))).fill(0);
  for (const s of use) {
    const interval = s.pointInterval ?? stepMs;
    const points = s.data!.map((p, i): [number, number] =>
      Array.isArray(p) ? [p[0], p[1]] : typeof p === 'object' ? [p.x, p.y] : [i * interval, p],
    );
    const t0 = points[0][0];
    for (const [t, v] of points) {
      if (!Number.isFinite(v) || v <= 0) continue;
      const b = Math.min(buckets.length - 1, Math.max(0, Math.floor((t - t0) / stepMs)));
      buckets[b] += v;
    }
  }
  const sum = buckets.reduce((a, b) => a + b, 0);
  if (sum <= 0) return undefined;
  let run = 0;
  const cumulative = [0, ...buckets.map((b) => {
    run += b;
    return Math.round((run / sum) * total);
  })];
  return { stepMs, cumulative };
}

const SCHOOLS: Record<number, string> = { 1: 'Physical', 2: 'Holy', 4: 'Fire', 8: 'Nature', 16: 'Frost', 32: 'Shadow', 64: 'Arcane' };
export const SCHOOL_ORDER = ['Physical', 'Holy', 'Fire', 'Nature', 'Frost', 'Shadow', 'Arcane', 'Mixed'];

/** Damage taken per second, grouped by school (multi-school damage counts as "Mixed"). */
export function takenBySchool(entries: { type?: number | string; total: number }[], durationMs: number): SchoolTotal[] {
  const seconds = durationMs / 1000;
  if (seconds <= 0) return [];
  const totals = new Map<string, number>();
  for (const e of entries) {
    const school = SCHOOLS[Number(e.type)] ?? 'Mixed';
    totals.set(school, (totals.get(school) ?? 0) + (e.total || 0));
  }
  return SCHOOL_ORDER.filter((s) => totals.get(s)).map((school) => ({ school, perSecond: totals.get(school)! / seconds }));
}

/**
 * TBC potion spells. Logs record them under the effect's name ("Haste", "Restore Mana"), not the
 * item's, so they are matched by id and icon as well as by name.
 */
const POTION_IDS = new Set([
  28507, // Haste Potion → "Haste"
  28508, // Destruction Potion
  28499, // Super Mana Potion → "Restore Mana"
  28495, // Super Healing Potion → "Healing Potion"
  28494, // Insane Strength Potion
  28506, // Heroic Potion
  28515, // Ironshield Potion → "Ironshield"
  38929, // Fel Mana Potion
  45051, // Mad Alchemist's Potion
  28511, 28512, 28513, 28536, 28537, // Major Fire / Frost / Nature / Arcane / Shadow Protection
]);
const POTION_ICON = /inv_potion|inv_alchemy_.*potion/i;
const FLASK_OR_ELIXIR = /flask|elixir/i;

interface Aura {
  name: string;
  guid?: number;
  abilityIcon?: string;
  totalUptime?: number;
  totalUses?: number;
  bands?: unknown[];
}
interface Cast {
  name: string;
  guid?: number;
  abilityIcon?: string;
  total: number;
}

const looksLikePotion = (a: { name: string; guid?: number; abilityIcon?: string }) =>
  (a.guid != null && POTION_IDS.has(a.guid)) || /potion/i.test(a.name) || POTION_ICON.test(a.abilityIcon ?? '');

/**
 * Flask/elixir and food uptime from the buffs table, and potions used. Potions are counted from
 * the casts table (mana and healing potions) and from buffs (Haste, Destruction… including one
 * drunk just before the pull, which has no cast inside the fight), once per spell.
 */
export function preparation(buffs: Aura[], casts: Cast[], totalTime: number): Preparation {
  // Flask and elixir buffs share the potion icons, but last the whole fight; potion buffs last seconds.
  const isFlask = (b: Aura) =>
    FLASK_OR_ELIXIR.test(b.name) ||
    (!looksLikePotion({ ...b, abilityIcon: '' }) && POTION_ICON.test(b.abilityIcon ?? '') && (b.totalUptime ?? 0) > Math.min(totalTime * 0.6, 120_000));
  const uptime = (list: Aura[]) => {
    const best = Math.max(0, ...list.map((b) => b.totalUptime ?? 0));
    return totalTime > 0 && best > 0 ? Math.min(1, best / totalTime) : null;
  };

  const uses = new Map<string, number>();
  const add = (key: string, n: number) => uses.set(key, Math.max(uses.get(key) ?? 0, n));
  for (const c of casts) if (looksLikePotion(c) && c.total > 0) add(String(c.guid ?? c.name), c.total);
  for (const b of buffs) {
    if (isFlask(b) || !looksLikePotion(b)) continue;
    const n = Math.max(b.totalUses ?? 0, Array.isArray(b.bands) ? b.bands.length : 0, (b.totalUptime ?? 0) > 0 ? 1 : 0);
    if (n > 0) add(String(b.guid ?? b.name), n);
  }

  return {
    flask: uptime(buffs.filter(isFlask)),
    food: uptime(buffs.filter((b) => /well fed/i.test(b.name))),
    potions: [...uses.values()].reduce((a, b) => a + b, 0),
  };
}
