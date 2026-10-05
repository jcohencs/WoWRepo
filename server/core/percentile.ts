export const PAGE_SIZE = 100;

/**
 * 1-based rank of the entry at the given percentile among `count` parses sorted best-first.
 * The 99th percentile of 1000 parses is rank 10: 99% of parses are at or below it.
 */
export function percentileRank(count: number, percentile: number): number {
  if (!Number.isFinite(count) || count < 1) throw new RangeError('count must be >= 1');
  if (percentile <= 0 || percentile >= 100) throw new RangeError('percentile must be in (0, 100)');
  const rank = Math.ceil(count * (1 - percentile / 100) - 1e-9);
  return Math.min(count, Math.max(1, rank));
}

/** Ranking page (1-based) and index within it for a 1-based rank. */
export function locateRank(rank: number, pageSize = PAGE_SIZE): { page: number; index: number } {
  return { page: Math.ceil(rank / pageSize), index: (rank - 1) % pageSize };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
