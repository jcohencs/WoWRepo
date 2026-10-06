import type { ClassLeader, Metric } from '../../shared/types.js';
import type { RawRanking } from './benchmark.js';
import { CLASSES } from './classes.js';

/** Classes that heal as well as deal damage: they get a healing #1 next to the DPS #1. */
export const HYBRIDS = new Set(Object.values(CLASSES).filter((c) => c.healers.length > 0).map((c) => c.name));

/** Which role lists each class has: DPS for everyone, healing too for hybrids. */
export const roleMetrics = (className: string): Metric[] => (HYBRIDS.has(className) ? ['dps', 'hps'] : ['dps']);

/**
 * The realm's #1 of one class and role from Warcraft Logs' realm rankings for each boss (best
 * first). Each boss scores a player their amount as a share of the realm's best on it, so the #1
 * is whoever comes closest to the top across the whole raid, not someone who only killed one boss.
 */
export function leaderFromRankings(className: string, metric: Metric, bosses: RawRanking[][]): ClassLeader | null {
  type Tally = { score: number; amounts: number[]; firsts: number; specs: Map<string, number> };
  const players = new Map<string, Tally>();
  for (const rankings of bosses) {
    const top = rankings[0]?.amount ?? 0;
    if (top <= 0) continue;
    const seen = new Set<string>();
    rankings.forEach((r, i) => {
      if (!r?.name || seen.has(r.name)) return; // a player's best kill is listed first
      seen.add(r.name);
      const p: Tally = players.get(r.name) ?? { score: 0, amounts: [], firsts: 0, specs: new Map<string, number>() };
      p.score += r.amount / top;
      p.amounts.push(r.amount);
      if (i === 0) p.firsts++;
      if (r.spec) p.specs.set(r.spec, (p.specs.get(r.spec) ?? 0) + 1);
      players.set(r.name, p);
    });
  }
  const best = [...players.entries()].sort(
    ([an, a], [bn, b]) => b.score - a.score || b.firsts - a.firsts || avg(b.amounts) - avg(a.amounts) || an.localeCompare(bn),
  )[0];
  if (!best) return null;
  const [name, p] = best;
  const spec = [...p.specs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return { className, name, spec, metric, perSecond: avg(p.amounts), bosses: p.amounts.length, firsts: p.firsts, bossCount: bosses.length };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
