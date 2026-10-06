import type { Benchmark, Metric, RankingEntry } from '../../shared/types.js';
import { locateRank, percentileRank } from './percentile.js';

/** One entry of a WCL `characterRankings` page. */
export interface RawRanking {
  name: string;
  amount: number;
  duration: number;
  report: { code: string; fightID: number };
  server?: { name?: string };
  spec?: string;
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

/**
 * Percentiles shown on the "where you sit" ladder; each is read from its exact ranking position.
 * The 10th and 25th are left out: they sit deepest in the rankings, so each cost an extra page.
 */
export const LADDER = [50, 75, 90, 95, 99] as const;

export function keyString(k: BenchmarkKey): string {
  return `${k.encounterId}|${k.className}|${k.spec}|${k.metric}`;
}

/** Total ranked parses for a spec, from the first ranking page. */
export function rankingCount(first: RawRankingPage): number | null {
  if (typeof first.count === 'number' && first.count > 0) return first.count;
  if (first.hasMorePages === false) return first.rankings.length || null;
  return null;
}

/**
 * Ranking pages needed besides page 1: none. Page 1 holds the top 1% player and number (for up to
 * 10,000 ranked parses); the median and lower ladder steps are only shown when they're on page 1
 * too, rather than costing another page per boss.
 */
export function pagesNeeded(_count: number): number[] {
  return [];
}

export function toEntry(r: RawRanking): RankingEntry {
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
  if (!p99) return null;
  const ladder = LADDER.flatMap((p) => {
    const entry = at(p);
    return entry ? [{ percentile: p, amount: entry.amount }] : [];
  });
  return {
    ...key,
    sampleSize: count,
    p50: p50?.amount ?? null,
    p99: p99.amount,
    reference: toEntry(p99),
    ladder,
  };
}
