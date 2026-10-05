import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOUR, TtlCache } from '../../server/cache';
import { ApiFailure, PendingPull } from '../../server/errors';
import { Puller, SnapshotProvider } from '../../server/snapshot';
import { fakeWcl, handler } from './fake-wcl';

const brannoc = { region: 'US' as const, realm: 'nightslayer', name: 'Brannoc' };
/** Not found by roster discovery, so only a visitor's search brings them in. */
const newcomer = { region: 'US' as const, realm: 'nightslayer', name: 'Newcomer' };
const raid = '2011-black-temple';

function setup() {
  const cache = new TtlCache({ serveStale: false });
  const { provider: live, queries } = fakeWcl(handler, cache);
  const puller = new Puller(live, cache);
  const site = new SnapshotProvider(live, cache, puller);
  return { cache, live, queries, puller, site };
}

async function pending(p: Promise<unknown>): Promise<PendingPull> {
  try {
    await p;
  } catch (e) {
    if (e instanceof PendingPull) return e;
    throw e;
  }
  throw new Error('expected PendingPull');
}

afterEach(() => vi.useRealTimers());

describe('saved pages + scheduled puller', () => {
  it('never calls Warcraft Logs for a visitor; new lookups wait in line', async () => {
    const { site, queries, puller } = setup();
    await puller.run(); // load the raid list
    const before = queries.length;

    expect((await pending(site.zoneReport(newcomer, raid))).position).toBe(1);
    expect((await pending(site.zoneReport({ ...newcomer, name: 'Other' }, raid))).position).toBe(2);
    expect((await pending(site.zoneReport(newcomer, raid))).position).toBe(1); // not queued twice
    expect(queries.length).toBe(before);
  });

  it('shows the saved page after the scheduled pull', async () => {
    const { site, puller, queries } = setup();
    await puller.run();
    await pending(site.zoneReport(newcomer, raid));
    await puller.run();
    expect(puller.queue()).toHaveLength(0);

    const before = queries.length;
    const report = await site.zoneReport(newcomer, raid);
    expect(report.character.className).toBe('Warrior');
    expect(report.rows[0].benchmark?.p99).toBe(2990);
    expect(queries.length).toBe(before);
  });

  it('tells visitors when a character does not exist', async () => {
    const { site, puller } = setup();
    await puller.run();
    const nobody = { ...brannoc, name: 'Nobody' };
    await pending(site.zoneReport(nobody, raid));
    await puller.run();
    await expect(site.zoneReport(nobody, raid)).rejects.toBeInstanceOf(ApiFailure);
    await expect(site.zoneReport(nobody, raid)).rejects.toThrow(/Couldn't find/);
  });

  it('re-pulls pages people opened once they are old, and keeps showing the old copy meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { site, puller, queries } = setup();
    await puller.run();
    await pending(site.zoneReport(newcomer, raid));
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

  it('queues comparisons the same way', async () => {
    const { site, puller } = setup();
    await puller.run();
    await pending(site.compare(brannoc, 601, 'Fury'));
    await puller.run();
    const c = await site.compare(brannoc, 601, 'Fury');
    expect(c.ref.name).toBe('P10');
  });
});
