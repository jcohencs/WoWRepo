import type { ClassLeader, Metric, ZoneReport } from '../../shared/types.js';
import { CLASSES } from './classes.js';

/** A parse of 99 or more is the top 1%. */
export const TOP_PARSE = 99;

/**
 * The #1 player of each class: the best average parse as one spec. To keep one lucky kill from
 * topping the list, only players with the most bosses killed (at least 3, or every boss in a
 * smaller raid) count, unless nobody in the class has that many yet.
 */
export function buildLeaders(pages: ZoneReport[], bossCount: number): { className: string; leader: ClassLeader | null }[] {
  const minBosses = Math.min(3, Math.max(1, bossCount));
  const byClass = new Map<string, ClassLeader[]>();
  for (const page of pages) {
    const className = page.character?.className;
    if (!className || !Array.isArray(page.rows)) continue;
    const bySpec = new Map<string, { metric: Metric; parses: number[]; amounts: number[] }>();
    for (const row of page.rows) {
      if (row.best == null || row.rankPercent == null) continue;
      const spec = row.spec === 'Guardian' ? 'Feral' : row.spec;
      const s = bySpec.get(spec) ?? { metric: row.metric, parses: [], amounts: [] };
      s.parses.push(row.rankPercent);
      s.amounts.push(row.best);
      bySpec.set(spec, s);
    }
    for (const [spec, s] of bySpec) {
      const list = byClass.get(className) ?? [];
      list.push({
        className,
        name: page.character.name,
        spec,
        metric: s.metric,
        averageParse: s.parses.reduce((a, b) => a + b, 0) / s.parses.length,
        perSecond: s.amounts.reduce((a, b) => a + b, 0) / s.amounts.length,
        bosses: s.parses.length,
        topParses: s.parses.filter((p) => p >= TOP_PARSE).length,
      });
      byClass.set(className, list);
    }
  }

  return Object.values(CLASSES).map((cls) => {
    const all = byClass.get(cls.name) ?? [];
    const enough = all.filter((c) => c.bosses >= minBosses);
    const pool = enough.length ? enough : all;
    const leader = [...pool].sort((a, b) => b.averageParse - a.averageParse || b.bosses - a.bosses || b.perSecond - a.perSecond || a.name.localeCompare(b.name))[0] ?? null;
    return { className: cls.name, leader };
  });
}
