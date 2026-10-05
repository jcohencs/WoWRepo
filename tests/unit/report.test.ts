import { describe, expect, it } from 'vitest';
import type { Benchmark } from '../../shared/types';
import { metricFor } from '../../server/core/classes';
import { buildRow, mainSpec, summarise } from '../../server/core/report';

const bench = (p99: number): Benchmark => ({
  encounterId: 1,
  className: 'Warrior',
  spec: 'Fury',
  metric: 'dps',
  sampleSize: 1000,
  p50: p99 * 0.7,
  p99,
  reference: { name: 'X', server: 'Y', amount: p99, durationMs: 1, reportCode: 'c', fightId: 1 },
});

describe('buildRow', () => {
  it('computes the gap to p99', () => {
    const row = buildRow({ id: 1, name: 'Boss' }, 'Fury', 'dps', { encounterId: 1, spec: 'Fury', kills: 3, best: 1800, rankPercent: 90 }, bench(2000));
    expect(row.gap).toEqual({ absolute: -200, percent: -0.1 });
    expect(row.rankPercent).toBe(90);
  });
  it('keeps the benchmark for bosses without a kill', () => {
    const row = buildRow({ id: 1, name: 'Boss' }, 'Fury', 'dps', undefined, bench(2000));
    expect(row.best).toBeNull();
    expect(row.gap).toBeNull();
    expect(row.benchmark?.p99).toBe(2000);
  });
});

describe('summarise', () => {
  it('aggregates killed bosses only', () => {
    const rows = [
      buildRow({ id: 1, name: 'A' }, 'Fury', 'dps', { encounterId: 1, spec: 'Fury', kills: 1, best: 2100, rankPercent: 99.4 }, bench(2000)),
      buildRow({ id: 2, name: 'B' }, 'Fury', 'dps', { encounterId: 2, spec: 'Fury', kills: 1, best: 1600, rankPercent: 80.6 }, bench(2000)),
      buildRow({ id: 3, name: 'C' }, 'Fury', 'dps', undefined, bench(2000)),
    ];
    const s = summarise(rows);
    expect(s).toMatchObject({ bossesKilled: 2, bossCount: 3, bossesAtP99: 1 });
    expect(s.averageParse).toBeCloseTo(90);
    expect(s.medianGapPercent).toBeCloseTo((0.05 + -0.2) / 2);
  });
});

describe('spec helpers', () => {
  it('picks the most-killed spec', () => {
    expect(
      mainSpec(
        [
          { encounterId: 1, spec: 'Arms', kills: 1, best: 1, rankPercent: 1 },
          { encounterId: 2, spec: 'Fury', kills: 4, best: 1, rankPercent: 1 },
        ],
        'Arms',
      ),
    ).toBe('Fury');
    expect(mainSpec([], 'Arms')).toBe('Arms');
  });
  it('uses HPS for healers only', () => {
    expect(metricFor('Priest', 'Holy')).toBe('hps');
    expect(metricFor('Priest', 'Shadow')).toBe('dps');
    expect(metricFor('Paladin', 'Retribution')).toBe('dps');
    expect(metricFor('Druid', 'Restoration')).toBe('hps');
  });
});
