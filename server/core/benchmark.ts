import type { Benchmark, Metric, RankingEntry } from '../../shared/types.js';
import { locateRank, percentileRank } from './percentile.js';

/** One entry of a WCL `characterRankings` page. */
export interface RawRanking {
  name: string;
  amount: number;
  duration: number;
  report: { code: string; fightID: number };
  server?: { name?: string };
}

export interface RawRankingPage {
  page?: number;
  hasMorePages?: boolean;
  count?: number;
  rankings: RawRanking[];
}

export interface BenchmarkKey {
  encounterId: number;
  className: string;
  spec: string;
  metric: Metric;
}

export const PERCENTILES = { p50: 50, p99: 99 } as const;

export function keyString(k: BenchmarkKey): string {
  return `${k.encounterId}|${k.className}|${k.spec}|${k.metric}`;
}

/** Total ranked parses for a spec, from the first ranking page. */
export function rankingCount(first: RawRankingPage): number | null {
  if (typeof first.count === 'number' && first.count > 0) return first.count;
  if (first.hasMorePages === false) return first.rankings.length || null;
  return null;
}

/** Ranking pages needed (besides page 1) to read every tracked percentile. */
export function pagesNeeded(count: number): number[] {
  const pages = new Set<number>();
  for (const p of Object.values(PERCENTILES)) pages.add(locateRank(percentileRank(count, p)).page);
  pages.delete(1);
  return [...pages];
}

function toEntry(r: RawRanking): RankingEntry {
  return {
    name: r.name,
    server: r.server?.name ?? '',
    amount: r.amount,
    durationMs: r.duration,
    reportCode: r.report.code,
    fightId: r.report.fightID,
  };
}

/** Reads p50/p99 from the ranking pages. Returns null if the spec has no ranked parses. */
export function buildBenchmark(key: BenchmarkKey, count: number | null, pages: Map<number, RawRanking[]>): Benchmark | null {
  if (!count) return null;
  const at = (percentile: number): RawRanking | undefined => {
    const { page, index } = locateRank(percentileRank(count, percentile));
    const list = pages.get(page);
    // Rankings can shift between page requests; clamp to the last entry on the page.
    return list?.[Math.min(index, list.length - 1)];
  };
  const p99 = at(PERCENTILES.p99);
  const p50 = at(PERCENTILES.p50);
  if (!p99 || !p50) return null;
  return {
    ...key,
    sampleSize: count,
    p50: p50.amount,
    p99: p99.amount,
    reference: toEntry(p99),
  };
}
