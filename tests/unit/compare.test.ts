import { describe, expect, it } from 'vitest';
import { compareAbilities } from '../../server/core/compare';

describe('compareAbilities', () => {
  const you = {
    durationMs: 120000,
    amounts: [
      { guid: 1, name: 'Melee', total: 600 },
      { guid: 30335, name: 'Bloodthirst', total: 400 },
    ],
    casts: [{ guid: 30335, name: 'Bloodthirst', total: 18 }],
  };
  const ref = {
    durationMs: 60000,
    amounts: [
      { guid: 1, name: 'Melee', total: 500 },
      { guid: 30335, name: 'Bloodthirst', total: 300 },
      { guid: 1680, name: 'Whirlwind', total: 200 },
    ],
    casts: [
      { guid: 30335, name: 'Bloodthirst', total: 10 },
      { guid: 1680, name: 'Whirlwind', total: 6 },
    ],
  };

  const lines = compareAbilities(you, ref);
  const byName = Object.fromEntries(lines.map((l) => [l.name, l]));

  it('computes shares of each player total', () => {
    expect(byName.Melee.you?.share).toBeCloseTo(0.6);
    expect(byName.Melee.ref?.share).toBeCloseTo(0.5);
    expect(byName.Melee.shareDelta).toBeCloseTo(0.1);
  });

  it('normalises casts by fight length', () => {
    expect(byName.Bloodthirst.you?.cpm).toBeCloseTo(9);
    expect(byName.Bloodthirst.ref?.cpm).toBeCloseTo(10);
  });

  it('keeps abilities only one side used, with the other side empty', () => {
    expect(byName.Whirlwind.you).toBeNull();
    expect(byName.Whirlwind.shareDelta).toBeCloseTo(-0.2);
  });

  it('sorts by the larger share', () => {
    expect(lines.map((l) => l.name)).toEqual(['Melee', 'Bloodthirst', 'Whirlwind']);
  });
});
