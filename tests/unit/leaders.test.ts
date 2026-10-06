import { describe, expect, it } from 'vitest';
import type { RawRanking } from '../../server/core/benchmark';
import { leaderFromRankings, roleMetrics } from '../../server/core/leaders';

const r = (name: string, amount: number, spec = 'Fury') => ({ name, amount, spec, duration: 1, report: { code: 'x', fightID: 1 } }) as RawRanking;

describe('leaderFromRankings', () => {
  it('picks whoever comes closest to the realm’s best across the raid', () => {
    const leader = leaderFromRankings('Warrior', 'dps', [
      [r('Lucky', 3000), r('Alphac', 2900), r('Brannoc', 2000)], // boss 1
      [r('Alphac', 2500), r('Brannoc', 2400), r('Alphac', 2100)], // boss 2 (Alphac's slower kill is ignored)
      [r('Brannoc', 2200), r('Alphac', 2150, 'Arms')], // boss 3
    ]);
    expect(leader).toMatchObject({ name: 'Alphac', spec: 'Fury', metric: 'dps', bosses: 3, firsts: 1, bossCount: 3 });
    expect(leader!.perSecond).toBeCloseTo((2900 + 2500 + 2150) / 3);
  });

  it('gives null when nobody is ranked', () => {
    expect(leaderFromRankings('Mage', 'dps', [[], []])).toBeNull();
  });

  it('lists a healing #1 only for hybrid classes', () => {
    expect(roleMetrics('Priest')).toEqual(['dps', 'hps']);
    expect(roleMetrics('Druid')).toEqual(['dps', 'hps']);
    expect(roleMetrics('Warrior')).toEqual(['dps']);
  });
});
