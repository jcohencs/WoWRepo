import { describe, expect, it } from 'vitest';
import { fakeWcl, handler } from './fake-wcl';

const brannoc = { region: 'US' as const, realm: 'dreamscythe', name: 'Brannoc' };

describe('WclProvider', () => {
  it('splits combined zones into raids and drops non-raids', async () => {
    const { provider } = fakeWcl(handler);
    expect((await provider.raids()).map((r) => [r.id, r.name, r.encounters.length])).toEqual([
      ['mount-hyjal', 'Mount Hyjal', 1],
      ['black-temple', 'Black Temple', 2],
    ]);
  });

  it('compares with the realm\'s #1 of the spec from the saved #1 pull, with no ranking requests', async () => {
    const { provider, queries } = fakeWcl(handler);
    const raid = (await provider.raids()).find((r) => r.id === 'black-temple')!;
    await provider.classLeaders('US', 'nightslayer', raid); // the daily #1 pull (saves the realm's best per spec)
    const before = queries.length;
    const report = await provider.zoneReport({ ...brannoc, realm: 'nightslayer' }, 'black-temple');
    expect(report.character.className).toBe('Warrior');
    const [naj, sup] = report.rows;
    expect(naj.spec).toBe('Fury');
    // Brannoc is the realm's #1 Fury Warrior, so he's compared with the #2 (Morwenna).
    expect(naj.benchmark).toMatchObject({ p99: 2899, p50: null, reference: { name: 'Morwenna', reportCode: 'REALM1' } });
    expect(naj.gap?.absolute).toBe(2700 - 2899);
    expect(sup.best).toBeNull();
    expect(sup.benchmark?.spec).toBe('Fury');
    expect(queries.slice(before).filter((q) => q.includes('characterRankings'))).toHaveLength(0);
  });

  it('has no reference before the realm\'s #1 list was pulled', async () => {
    const { provider } = fakeWcl(handler);
    const report = await provider.zoneReport(brannoc, 'black-temple');
    expect(report.rows.every((r) => r.benchmark === null)).toBe(true);
  });

  it('shows a chosen spec on every boss and refuses specs the class does not have', async () => {
    const { provider, queries } = fakeWcl(handler);
    const arms = await provider.zoneReport(brannoc, 'black-temple', 'Arms');
    expect(arms.spec).toBe('Arms');
    expect(arms.specs).toEqual(['Arms', 'Fury', 'Protection']);
    expect(arms.rows.every((r) => r.spec === 'Arms')).toBe(true);
    expect(queries.some((q) => q.includes('specName: $spec'))).toBe(true);
    await expect(provider.zoneReport(brannoc, 'black-temple', 'Holy')).rejects.toThrow(/don't have a Holy spec/);

    const auto = await provider.zoneReport(brannoc, 'black-temple');
    expect(auto.spec).toBeNull();
    expect(auto.mainSpec).toBe('Fury');
  });

  it('leaves out raids that are not out yet, and accepts old numbered raid links', async () => {
    const { provider } = fakeWcl((query, variables) => {
      // Release check: nobody has killed Hyjal's first boss yet.
      if (query.includes('characterRankings(metric: dps, page: 1)') && !query.includes('className') && !query.includes('serverSlug')) {
        return { worldData: { q0: { characterRankings: { rankings: [] } }, q1: { characterRankings: { rankings: [{ name: 'X' }] } } } };
      }
      return handler(query, variables);
    });
    expect((await provider.raids()).map((r) => r.id)).toEqual(['black-temple']);
    const report = await provider.zoneReport(brannoc, '2011-black-temple');
    expect(report.raid.id).toBe('black-temple');
  });

  it('still shows your own breakdown when the top 1% log cannot be loaded', async () => {
    const { provider } = fakeWcl((query, variables) => {
      if (query.includes('players: table') && variables.code !== 'MINE') return { reportData: { report: null } };
      return handler(query, variables);
    });
    await provider.zoneReport(brannoc, 'black-temple');
    const c = await provider.compare(brannoc, 601, 'Fury');
    expect(c.ref).toBeNull();
    expect(c.you.name).toBe('Brannoc');
    expect(c.abilities.map((a) => a.name)).toEqual(['Melee', 'Bloodthirst']);
    expect(c.abilities.every((a) => a.ref === null)).toBe(true);
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
    const me = { ...brannoc, realm: 'nightslayer' };
    await provider.classLeaders('US', 'nightslayer', (await provider.raids()).find((r) => r.id === 'black-temple')!);
    await provider.zoneReport(me, 'black-temple');
    const before = queries.length;
    const c = await provider.compare(me, 601, 'Fury');
    const used = queries.slice(before);
    expect(used.filter((q) => q.includes('encounterRankings'))).toHaveLength(1);
    expect(used).toHaveLength(5); // best kill + 2 per side
    expect(c.you.name).toBe('Brannoc');
    expect(c.ref?.name).toBe('Morwenna'); // the realm's #2, since Brannoc is the #1
    expect(c.you.activeTime).toBeCloseTo(0.95);
    expect(c.abilities.map((a) => a.name)).toEqual(['Melee', 'Bloodthirst']);

    await provider.compare(me, 601, 'Fury');
    expect(queries.length).toBe(before + 5);
  });

  it('still shows the breakdown when the extra charts are rejected, and skips hidden logs', async () => {
    const { provider } = fakeWcl((query, variables) => {
      if (query.includes('graph:')) throw new Error('Unknown argument');
      if (query.includes('ranks: encounterRankings')) {
        const r = handler(query, variables) as { characterData: { character: { ranks: { ranks: object[] } } } };
        r.characterData.character.ranks.ranks.push({ amount: 9999, duration: 1, report: null });
        return r;
      }
      return handler(query, variables);
    });
    await provider.zoneReport(brannoc, 'black-temple');
    const c = await provider.compare(brannoc, 601, 'Fury');
    expect(c.you.reportCode).toBe('MINE');
    expect(c.abilities.map((a) => a.name)).toEqual(['Melee', 'Bloodthirst']);
    expect(c.you.timeline).toBeUndefined();
  });

});
