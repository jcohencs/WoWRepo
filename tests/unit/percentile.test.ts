import { describe, expect, it } from 'vitest';
import { buildBenchmark, pagesNeeded, rankingCount, type RawRanking } from '../../server/core/benchmark';
import { locateRank, median, percentileRank } from '../../server/core/percentile';

describe('percentileRank', () => {
  it('reads the 99th percentile of 1000 parses at rank 10', () => {
    expect(percentileRank(1000, 99)).toBe(10);
  });
  it('rounds up so the entry is never better than the true percentile', () => {
    expect(percentileRank(1234, 99)).toBe(13);
    expect(percentileRank(1234, 50)).toBe(617);
  });
  it('clamps to rank 1 for tiny samples', () => {
    expect(percentileRank(1, 99)).toBe(1);
    expect(percentileRank(40, 99)).toBe(1);
  });
  it('rejects invalid input', () => {
    expect(() => percentileRank(0, 99)).toThrow();
    expect(() => percentileRank(10, 100)).toThrow();
  });
});

describe('locateRank', () => {
  it('maps ranks onto 100-entry pages', () => {
    expect(locateRank(1)).toEqual({ page: 1, index: 0 });
    expect(locateRank(100)).toEqual({ page: 1, index: 99 });
    expect(locateRank(101)).toEqual({ page: 2, index: 0 });
    expect(locateRank(617)).toEqual({ page: 7, index: 16 });
  });
});

describe('median', () => {
  it('handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

const entry = (rank: number): RawRanking => ({
  name: `P${rank}`,
  amount: 3000 - rank,
  duration: 120000,
  report: { code: `r${rank}`, fightID: rank },
  server: { name: 'Dreamscythe' },
});
const page = (n: number, size = 100) => Array.from({ length: size }, (_, i) => entry((n - 1) * 100 + i + 1));

describe('benchmarks', () => {
  const key = { encounterId: 601, className: 'Warrior', spec: 'Fury', metric: 'dps' as const };

  it('uses the count from page 1, or the page length when there is only one page', () => {
    expect(rankingCount({ count: 4321, rankings: [] })).toBe(4321);
    expect(rankingCount({ hasMorePages: false, rankings: page(1, 37) })).toBe(37);
    expect(rankingCount({ hasMorePages: true, rankings: page(1) })).toBeNull();
  });

  it('asks only for the pages that hold p50/p99', () => {
    expect(pagesNeeded(1000)).toEqual([5]); // p99 rank 10 is on page 1, p50 rank 500 on page 5
    expect(pagesNeeded(20000).sort()).toEqual([100, 2]); // rank 200 → page 2, rank 10000 → page 100
  });

  it('reads the exact entries at p50 and p99', () => {
    const b = buildBenchmark(key, 1000, new Map([[1, page(1)], [5, page(5)]]))!;
    expect(b.sampleSize).toBe(1000);
    expect(b.p99).toBe(3000 - 10);
    expect(b.p50).toBe(3000 - 500);
    expect(b.reference).toMatchObject({ name: 'P10', reportCode: 'r10', fightId: 10 });
  });

  it('returns null when nothing is ranked', () => {
    expect(buildBenchmark(key, null, new Map())).toBeNull();
  });
});
