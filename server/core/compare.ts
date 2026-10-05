import type { AbilityLine, AbilityStat } from '../../shared/types.js';

/** One row of a Warcraft Logs report table (DamageDone / Healing / Casts) for a single source. */
export interface TableEntry {
  guid: number;
  name: string;
  abilityIcon?: string;
  total: number;
}

export interface SideTables {
  durationMs: number;
  amounts: TableEntry[];
  casts: TableEntry[];
}

function stats(tables: SideTables): Map<number, { name: string; icon: string; stat: AbilityStat }> {
  const total = tables.amounts.reduce((sum, e) => sum + e.total, 0);
  const minutes = tables.durationMs / 60000;
  const out = new Map<number, { name: string; icon: string; stat: AbilityStat }>();
  const touch = (e: TableEntry) => {
    let row = out.get(e.guid);
    if (!row) {
      row = { name: e.name, icon: e.abilityIcon ?? '', stat: { amount: 0, share: 0, casts: 0, cpm: 0 } };
      out.set(e.guid, row);
    }
    if (!row.icon && e.abilityIcon) row.icon = e.abilityIcon;
    return row;
  };
  for (const e of tables.amounts) {
    const row = touch(e);
    row.stat.amount += e.total;
    row.stat.share = total > 0 ? row.stat.amount / total : 0;
  }
  for (const e of tables.casts) {
    const row = touch(e);
    row.stat.casts += e.total;
    row.stat.cpm = minutes > 0 ? row.stat.casts / minutes : 0;
  }
  return out;
}

export function compareAbilities(you: SideTables, ref: SideTables): AbilityLine[] {
  const a = stats(you);
  const b = stats(ref);
  const ids = new Set([...a.keys(), ...b.keys()]);
  const lines: AbilityLine[] = [];
  for (const id of ids) {
    const ya = a.get(id);
    const rb = b.get(id);
    const youStat = ya?.stat ?? null;
    const refStat = rb?.stat ?? null;
    const relevant = (s: AbilityStat | null) => s != null && (s.share >= 0.001 || s.casts > 0);
    if (!relevant(youStat) && !relevant(refStat)) continue;
    lines.push({
      id,
      name: ya?.name ?? rb!.name,
      icon: ya?.icon || rb?.icon || '',
      you: youStat,
      ref: refStat,
      shareDelta: (youStat?.share ?? 0) - (refStat?.share ?? 0),
    });
  }
  return lines.sort(
    (x, y) => Math.max(y.you?.share ?? 0, y.ref?.share ?? 0) - Math.max(x.you?.share ?? 0, x.ref?.share ?? 0),
  );
}
