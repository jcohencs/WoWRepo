import { describe, expect, it } from 'vitest';
import { fakeWcl, handler } from './fake-wcl';

const brannoc = { region: 'US' as const, realm: 'dreamscythe', name: 'Brannoc' };

describe('WclProvider', () => {
  it('splits combined zones into raids and drops non-raids', async () => {
    const { provider } = fakeWcl(handler);
    expect((await provider.raids()).map((r) => [r.id, r.name, r.encounters.length])).toEqual([
      ['2011-mount-hyjal', 'Mount Hyjal', 1],
      ['2011-black-temple', 'Black Temple', 2],
    ]);
  });

  it('builds the raid report with exact percentiles and caches benchmarks', async () => {
    const { provider, queries } = fakeWcl(handler);
    const report = await provider.zoneReport(brannoc, '2011-black-temple');
    expect(report.character.className).toBe('Warrior');
    const [naj, sup] = report.rows;
    expect(naj.spec).toBe('Fury');
    expect(naj.benchmark).toMatchObject({ sampleSize: 1000, p99: 2990, p50: 2500 });
    expect(naj.gap?.absolute).toBe(2700 - 2990);
    expect(sup.best).toBeNull();
    expect(sup.benchmark?.spec).toBe('Fury');
    const benchmarkQueries = queries.filter((q) => q.includes('characterRankings')).length;
    expect(benchmarkQueries).toBe(2);

    await provider.zoneReport(brannoc, '2011-black-temple');
    expect(queries.filter((q) => q.includes('characterRankings')).length).toBe(2);
  });

  it('shows a chosen spec on every boss and refuses specs the class does not have', async () => {
    const { provider, queries } = fakeWcl(handler);
    const arms = await provider.zoneReport(brannoc, '2011-black-temple', 'Arms');
    expect(arms.spec).toBe('Arms');
    expect(arms.specs).toEqual(['Arms', 'Fury', 'Protection']);
    expect(arms.rows.every((r) => r.spec === 'Arms')).toBe(true);
    expect(queries.some((q) => q.includes('specName: $spec'))).toBe(true);
    await expect(provider.zoneReport(brannoc, '2011-black-temple', 'Holy')).rejects.toThrow(/don't have a Holy spec/);

    const auto = await provider.zoneReport(brannoc, '2011-black-temple');
    expect(auto.spec).toBeNull();
    expect(auto.mainSpec).toBe('Fury');
  });

  it('syncs benchmarks for a spec, skipping saved ones', async () => {
    const { provider, queries } = fakeWcl(handler);
    const first = await provider.syncBenchmarks('warrior', 'fury');
    expect(first).toEqual({ fetched: 3, skipped: 0, remaining: 0 });
    const before = queries.length;
    const again = await provider.syncBenchmarks('Warrior', 'Fury');
    expect(again).toEqual({ fetched: 0, skipped: 3, remaining: 0 });
    expect(queries.length).toBe(before);
    await expect(provider.syncBenchmarks('Warrior', 'Holy')).rejects.toThrow(/no spec/);
  });

  it('opens a comparison: best kill, then both logs in parallel, all saved', async () => {
    const { provider, queries } = fakeWcl(handler);
    await provider.zoneReport(brannoc, '2011-black-temple');
    const before = queries.length;
    const c = await provider.compare(brannoc, 601, 'Fury');
    const used = queries.slice(before);
    expect(used.filter((q) => q.includes('encounterRankings'))).toHaveLength(1);
    expect(used).toHaveLength(5); // best kill + 2 per side
    expect(c.you.name).toBe('Brannoc');
    expect(c.ref.name).toBe('P10');
    expect(c.you.activeTime).toBeCloseTo(0.95);
    expect(c.abilities.map((a) => a.name)).toEqual(['Melee', 'Bloodthirst']);

    await provider.compare(brannoc, 601, 'Fury');
    expect(queries.length).toBe(before + 5);
  });

});
