import { describe, expect, it } from 'vitest';
import { bestPerWeek, preparation, takenBySchool, timelineFromGraph, weekStart } from '../../server/core/fight';

describe('weekStart', () => {
  it('snaps to the US reset (Tuesday 15:00 UTC)', () => {
    const reset = Date.UTC(2026, 9, 6, 15); // Tue 6 Oct 2026
    expect(weekStart(reset)).toBe(reset);
    expect(weekStart(reset + 3 * 86400_000)).toBe(reset); // Friday
    expect(weekStart(reset - 60_000)).toBe(reset - 7 * 86400_000); // a minute before reset
  });
});

describe('bestPerWeek', () => {
  it('keeps the best kill of each week, oldest first', () => {
    const tue = Date.UTC(2026, 9, 6, 16);
    const kill = (t: number, amount: number) => ({ startTime: t, amount, rankPercent: amount / 30, code: 'r', fight: 1 });
    const weeks = bestPerWeek([kill(tue + 7 * 86400_000, 2100), kill(tue, 1800), kill(tue + 86400_000, 1900)]);
    expect(weeks.map((w) => w.perSecond)).toEqual([1900, 2100]);
    expect(weeks[0].week).toBe(weekStart(tue));
  });
});

describe('timelineFromGraph', () => {
  it('scales the graph shape to the exact total', () => {
    const graph = { data: { series: [{ name: 'Total', pointInterval: 1000, data: [10, 10, 10, 10] }] } };
    const t = timelineFromGraph(graph, 400, 4000, 1000)!;
    expect(t.cumulative).toEqual([0, 100, 200, 300, 400]);
  });
  it('accepts [time, value] points and sums ability series when there is no total', () => {
    const graph = { data: { series: [{ name: 'A', data: [[5000, 1], [6000, 1]] }, { name: 'B', data: [[5000, 2], [6000, 0]] }] } };
    const t = timelineFromGraph(graph, 40, 2000, 1000)!;
    expect(t.cumulative).toEqual([0, 30, 40]);
  });
  it('gives up on an empty graph', () => {
    expect(timelineFromGraph({}, 100, 1000)).toBeUndefined();
  });
});

describe('takenBySchool', () => {
  it('groups damage taken by school per second', () => {
    expect(takenBySchool([{ type: 1, total: 1000 }, { type: 4, total: 500 }, { type: 32, total: 250 }, { type: 4, total: 500 }, { type: 36, total: 100 }], 10_000)).toEqual([
      { school: 'Physical', perSecond: 100 },
      { school: 'Fire', perSecond: 100 },
      { school: 'Shadow', perSecond: 25 },
      { school: 'Mixed', perSecond: 10 },
    ]);
  });
});

describe('preparation', () => {
  it('reads flask/elixir and food uptime, and counts potions', () => {
    const p = preparation(
      [{ name: 'Flask of Relentless Assault', totalUptime: 90_000 }, { name: 'Well Fed', totalUptime: 100_000 }, { name: 'Battle Shout', totalUptime: 100_000 }],
      [{ name: 'Haste Potion', total: 2 }, { name: 'Bloodthirst', total: 20 }],
      100_000,
    );
    expect(p).toEqual({ flask: 0.9, food: 1, potions: 2 });
    expect(preparation([], [], 100_000)).toEqual({ flask: null, food: null, potions: 0 });
  });
});
