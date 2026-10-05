import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOUR, MINUTE, TtlCache } from '../../server/cache';
import { ApiFailure } from '../../server/errors';
import { packSaved, persisted, Puller, SnapshotProvider } from '../../server/snapshot';
import { fakeWcl, handler } from './fake-wcl';

const brannoc = { region: 'US' as const, realm: 'nightslayer', name: 'Brannoc' };
/** Not found by roster discovery, so only a visitor's search brings them in. */
const newcomer = { region: 'US' as const, realm: 'nightslayer', name: 'Newcomer' };
const raid = 'black-temple';

function setup() {
  const cache = new TtlCache({ serveStale: false, persist: persisted, pack: packSaved });
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
    const again = await site.zoneReport(newcomer, raid);
    expect(queries.length).toBe(after); // saved copy, no API call
    expect(again.rows[0].benchmark?.p99).toBe(2990);
    expect(again.rows).toEqual(report.rows);
  });

  it('saves raid pages without a copy of each benchmark, and puts them back on read', async () => {
    const { site, cache } = setup();
    const report = await site.zoneReport(newcomer, raid);
    const saved = cache.peekAny<{ rows: { benchmark: unknown }[] }>(`view|zone|US|nightslayer|Newcomer|${raid}`)!.value;
    expect(saved.rows.every((r) => r.benchmark === null)).toBe(true);
    expect(report.rows.filter((r) => r.benchmark).length).toBeGreaterThan(0);
    expect(cache.peekAny('char|US|nightslayer|Newcomer|2011')).toBeDefined(); // in memory…
    expect(persisted('char|US|nightslayer|Newcomer|2011')).toBe(false); // …but not written to disk
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

  it('keeps opened pages for a day, then shows the saved copy while pulling a newer one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { site, puller, queries } = setup();
    await puller.run();
    const first = await site.zoneReport(newcomer, raid);
    const pulls = () => queries.filter((q) => q.includes('zoneRankings')).length;

    vi.setSystemTime(Date.now() + 3 * HOUR);
    const before = pulls();
    await puller.run();
    expect((await site.zoneReport(newcomer, raid)).updatedAt).toBe(first.updatedAt);
    expect(pulls()).toBe(before); // no 2-hour refresh any more

    vi.setSystemTime(Date.now() + 22 * HOUR);
    expect((await site.zoneReport(newcomer, raid)).updatedAt).toBe(first.updatedAt); // old copy, no waiting
    await vi.waitFor(() => expect(pulls()).toBe(before + 1)); // newer one pulled for next time
    await vi.waitFor(async () => expect((await site.zoneReport(newcomer, raid)).updatedAt).toBeGreaterThan(first.updatedAt));
  });

  it('Refresh re-pulls the raid page and drops saved comparisons, but not twice within minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { site, puller, queries, cache } = setup();
    await puller.run();
    const first = await site.zoneReport(brannoc, raid);
    await site.compare(brannoc, 601, 'Fury');
    expect(cache.peekAny('view|compare|US|nightslayer|Brannoc|601|Fury')).toBeDefined();

    vi.setSystemTime(Date.now() + HOUR);
    const before = queries.length;
    const fresh = await site.refresh(brannoc, raid);
    expect(fresh.updatedAt).toBeGreaterThan(first.updatedAt);
    expect(queries.slice(before).filter((q) => q.includes('zoneRankings'))).toHaveLength(1);
    expect(cache.peekAny('view|compare|US|nightslayer|Brannoc|601|Fury')).toBeUndefined();

    const after = queries.length;
    vi.setSystemTime(Date.now() + 2 * MINUTE);
    expect((await site.refresh(brannoc, raid)).updatedAt).toBe(fresh.updatedAt); // cooldown: saved copy
    expect(queries.length).toBe(after);
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

  it('does not re-pull anyone after a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'parsecheck-'));
    try {
      const file = join(dir, 'wcl.json');
      const opts = { file, serveStale: false, persist: persisted, pack: packSaved };
      const a = new TtlCache(opts);
      await new Puller(fakeWcl(handler, a).provider, a).run();
      a.flush();

      const b = new TtlCache(opts); // the server restarts
      const { provider, queries } = fakeWcl(handler, b);
      await new Puller(provider, b).run();
      expect(queries.filter((q) => q.includes('character('))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
