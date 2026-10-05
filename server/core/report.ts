import type { Benchmark, BossRow, Encounter, Metric, ZoneSummary } from '../../shared/types.js';
import { median } from './percentile.js';

export interface CharacterBest {
  encounterId: number;
  spec: string;
  kills: number;
  best: number | null;
  rankPercent: number | null;
}

export function buildRow(
  encounter: Encounter,
  spec: string,
  metric: Metric,
  best: CharacterBest | undefined,
  benchmark: Benchmark | null,
): BossRow {
  const amount = best && best.kills > 0 ? best.best : null;
  const gap =
    amount != null && benchmark && benchmark.p99 > 0
      ? { absolute: amount - benchmark.p99, percent: (amount - benchmark.p99) / benchmark.p99 }
      : null;
  return {
    encounter,
    spec,
    metric,
    kills: best?.kills ?? 0,
    best: amount,
    rankPercent: amount != null ? (best?.rankPercent ?? null) : null,
    benchmark,
    gap,
  };
}

export function summarise(rows: BossRow[]): ZoneSummary {
  const killed = rows.filter((r) => r.best != null);
  const parses = killed.map((r) => r.rankPercent).filter((p): p is number => p != null);
  const gaps = killed.map((r) => r.gap?.percent).filter((g): g is number => g != null);
  return {
    bossesKilled: killed.length,
    bossCount: rows.length,
    averageParse: parses.length ? parses.reduce((a, b) => a + b, 0) / parses.length : null,
    bossesAtP99: killed.filter((r) => r.gap != null && r.gap.absolute >= 0).length,
    medianGapPercent: median(gaps),
  };
}

/** The spec a character plays most across the zone, used for bosses they have not killed. */
export function mainSpec(bests: CharacterBest[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const b of bests) if (b.spec && b.kills > 0) counts.set(b.spec, (counts.get(b.spec) ?? 0) + b.kills);
  let top = fallback;
  let topCount = 0;
  for (const [spec, n] of counts) if (n > topCount) [top, topCount] = [spec, n];
  return top;
}
