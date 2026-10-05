import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOUR, TtlCache } from '../../server/cache';
import { ApiFailure } from '../../server/errors';
import { Puller, SnapshotProvider } from '../../server/snapshot';
import { fakeWcl, handler } from './fake-wcl';

const brannoc = { region: 'US' as const, realm: 'nightslayer', name: 'Brannoc' };
/** Not found by roster discovery, so only a visitor's search brings them in. */
const newcomer = { region: 'US' as const, realm: 'nightslayer', name: 'Newcomer' };
const raid = 'black-temple';

function setup() {
  const cache = new TtlCache({ serveStale: false });
  const { provider: live, queries } = fakeWcl(handler, cache);
  const puller = new Puller(live, cache);
  const site = new SnapshotProvider(live, cache, puller);
  return { cache, live, queries, puller, site };
}

afterEach(() => vi.useRealTimers());

describe('saved pages + scheduled puller', () => {
  it('pulls something not saved yet straight away, then serves the saved copy', async () => {
    const { site, queries, puller } = setup();
    await puller.run(); // raid list + realm sweep
    const before = queries.length;

    const report = await site.zoneReport(newcomer, raid); // no queue: fetched now
    expect(report.character.className).toBe('Warrior');
    expect(report.rows[0].benchmark?.p99).toBe(2990);
    expect(queries.length).toBeGreaterThan(before);

    const after = queries.length;
    await site.zoneReport(newcomer, raid);
    expect(queries.length).toBe(after); // saved copy, no API call
  });

  it('shares one pull when several visitors open the same new page at once', async () => {
    const { site, queries, puller } = setup();
    await puller.run();
    const before = queries.filter((q) => q.includes('zoneRankings')).length;
    await Promise.all([site.zoneReport(newcomer, raid), site.zoneReport(newcomer, raid), site.zoneReport(newcomer, raid)]);
    expect(queries.filter((q) => q.includes('zoneRankings')).length).toBe(before + 1);
  });

  it('tells visitors when a character does not exist, without asking again each time', async () => {
    const { site, puller, queries } = setup();
    await puller.run();
    const nobody = { ...brannoc, name: 'Nobody' };
    await expect(site.zoneReport(nobody, raid)).rejects.toThrow(/Couldn't find/);
    const before = queries.length;
    await expect(site.zoneReport(nobody, raid)).rejects.toBeInstanceOf(ApiFailure);
    expect(queries.length).toBe(before);
  });

  it('re-pulls pages people opened once they are old, and keeps showing the old copy meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { site, puller, queries } = setup();
    await puller.run();
    const first = await site.zoneReport(newcomer, raid);

    vi.setSystemTime(Date.now() + 3 * HOUR);
    expect((await site.zoneReport(newcomer, raid)).updatedAt).toBe(first.updatedAt); // old copy, no waiting
    const before = queries.filter((q) => q.includes('zoneRankings')).length;
    await puller.run();
    expect(queries.filter((q) => q.includes('zoneRankings')).length).toBe(before + 1);
    expect((await site.zoneReport(newcomer, raid)).updatedAt).toBeGreaterThan(first.updatedAt);
  });

  it('finds everyone who raids on the realms and pulls their pages ahead of time', async () => {
    const { site, puller, queries } = setup();
    await puller.run();
    expect(puller.roster('nightslayer').names).toEqual(['Brannoc', 'Morwenna']);
    expect(await site.characterNames('nightslayer')).toEqual(['Brannoc', 'Morwenna']);

    // Both characters were fetched together in one request, and their pages are ready.
    expect(queries.filter((q) => q.includes('c0: character(') && q.includes('c1: character('))).toHaveLength(1);
    const before = queries.length;
    const morwenna = await site.zoneReport({ ...brannoc, name: 'Morwenna' }, raid);
    expect(morwenna.character.name).toBe('Morwenna');
    expect(queries.length).toBe(before); // no queue, no API call
    expect(puller.progress()).toEqual([{ realm: 'Nightslayer', characters: 2, current: 2 }]);

    // Nothing is re-pulled until the day is up.
    await puller.run();
    expect(queries.length).toBe(before);
  });

  it('keeps each spec as its own saved page', async () => {
    const { site, puller } = setup();
    await puller.run();
    const best = await site.zoneReport(brannoc, raid); // swept already
    const arms = await site.zoneReport(brannoc, raid, 'Arms'); // pulled on first click
    expect(best.spec).toBeNull();
    expect(arms.spec).toBe('Arms');
  });

  it('upgrades pages saved by older versions instead of breaking', async () => {
    const { site, puller, cache } = setup();
    await puller.run();
    const key = 'view|zone|US|nightslayer|Brannoc|black-temple';
    const page = await site.zoneReport(brannoc, raid);
    const { specs: _s, mainSpec: _m, spec: _p, updatedAt: _u, ...old } = page;
    cache.set(key, old, 365 * 24 * HOUR);
    const upgraded = await site.zoneReport(brannoc, raid);
    expect(upgraded.specs).toEqual(['Arms', 'Fury', 'Protection']);
    expect(upgraded.mainSpec).toBe('Fury');
    expect(upgraded.spec).toBeNull();
    expect(typeof upgraded.updatedAt).toBe('number');
  });

  it('pulls a comparison on first click', async () => {
    const { site, puller } = setup();
    await puller.run();
    const c = await site.compare(brannoc, 601, 'Fury');
    expect(c.ref?.name).toBe('P10');
  });

  it('reports how much of the realm is left to pull', async () => {
    const { puller } = setup();
    expect(puller.remaining().discovering).toBe(true);
    await puller.run();
    expect(puller.remaining()).toMatchObject({ discovering: false, characters: 0 });
  });
});
