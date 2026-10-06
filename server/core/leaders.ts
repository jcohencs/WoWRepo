import type { ClassLeader, Metric, Role } from '../../shared/types.js';
import type { RawRanking } from './benchmark.js';
import { CLASSES } from './classes.js';

/** Classes that heal as well as deal damage: they get a healing #1 next to the damage #1. */
export const HYBRIDS = new Set(Object.values(CLASSES).filter((c) => c.healers.length > 0).map((c) => c.name));

/** Tank specs, as Warcraft Logs names them for TBC (bear Druids are "Guardian"). Tanks are ranked by their damage. */
export const TANK_SPECS: Record<string, string> = { Warrior: 'Protection', Paladin: 'Protection', Druid: 'Guardian' };

export interface RoleQuery {
  role: Role;
  metric: Metric;
  /** Ask Warcraft Logs for this spec only (tanks). */
  spec?: string;
}

/** The #1 lists each class has: damage for everyone, healing for hybrids, tanking for tank classes. */
export function classRoles(className: string): RoleQuery[] {
  const roles: RoleQuery[] = [{ role: 'damage', metric: 'dps' }];
  if (HYBRIDS.has(className)) roles.push({ role: 'healing', metric: 'hps' });
  if (TANK_SPECS[className]) roles.push({ role: 'tank', metric: 'dps', spec: TANK_SPECS[className] });
  return roles;
}

/**
 * The realm's #1 of one class and role from Warcraft Logs' realm rankings for each boss (best
 * first). Each boss scores a player their amount as a share of the realm's best on it, so the #1
 * is whoever comes closest to the top across the whole raid, not someone who only killed one boss.
 */
export function leaderFromRankings(className: string, metric: Metric, bosses: RawRanking[][], role: Role = metric === 'hps' ? 'healing' : 'damage'): ClassLeader | null {
  // The damage list leaves tanks out (they have their own list).
  const tankSpec = TANK_SPECS[className];
  if (role === 'damage' && tankSpec) bosses = bosses.map((list) => list.filter((r) => r.spec !== tankSpec && !(className === 'Druid' && r.spec === 'Guardian')));
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
  return { className, role, name, spec, metric, perSecond: avg(p.amounts), bosses: p.amounts.length, firsts: p.firsts, bossCount: bosses.length };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
