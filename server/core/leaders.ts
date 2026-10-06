import type { Leader, SpecLeaders, ZoneReport } from '../../shared/types.js';
import { CLASSES } from './classes.js';

/** A parse of 99 or more is the top 1%. */
export const TOP_PARSE = 99;

/**
 * Groups players by class and spec and keeps everyone with at least one top 1% parse, best first
 * (most top 1% bosses, then best average). Every class and spec is listed, even with nobody yet.
 */
export function buildLeaders(pages: ZoneReport[]): SpecLeaders[] {
  const bySpec = new Map<string, Map<string, { parses: number[] }>>();
  for (const page of pages) {
    const className = page.character?.className;
    if (!className || !Array.isArray(page.rows)) continue;
    for (const row of page.rows) {
      if (row.best == null || row.rankPercent == null) continue;
      const specKey = `${className}|${row.spec}`;
      const players = bySpec.get(specKey) ?? new Map<string, { parses: number[] }>();
      const who = players.get(page.character.name) ?? { parses: [] };
      who.parses.push(row.rankPercent);
      players.set(page.character.name, who);
      bySpec.set(specKey, players);
    }
  }

  const result: SpecLeaders[] = [];
  for (const cls of Object.values(CLASSES)) {
    for (const spec of cls.specs) {
      if (spec === 'Guardian') continue; // shown with Feral, as in TBC
      const keys = spec === 'Feral' ? [`${cls.name}|Feral`, `${cls.name}|Guardian`] : [`${cls.name}|${spec}`];
      const merged = new Map<string, number[]>();
      for (const key of keys) for (const [name, { parses }] of bySpec.get(key) ?? []) merged.set(name, [...(merged.get(name) ?? []), ...parses]);
      const players: Leader[] = [...merged.entries()]
        .map(([name, parses]) => ({
          name,
          topParses: parses.filter((p) => p >= TOP_PARSE).length,
          bestParse: Math.max(...parses),
          averageParse: parses.reduce((a, b) => a + b, 0) / parses.length,
        }))
        .filter((p) => p.topParses > 0)
        .sort((a, b) => b.topParses - a.topParses || b.averageParse - a.averageParse || a.name.localeCompare(b.name));
      result.push({ className: cls.name, spec, players });
    }
  }
  return result;
}
