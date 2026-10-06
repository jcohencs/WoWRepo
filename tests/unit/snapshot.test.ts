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

function setup(opts: { sweep?: boolean } = {}) {
  const cache = new TtlCache({ serveStale: false, persist: persisted, pack: packSaved });
  const { provider: live, queries } = fakeWcl(handler, cache);
  const puller = new Puller(live, cache, undefined, false, { sweep: opts.sweep ?? false });
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

  it('a searched character is pulled again once their page is an hour old; sooner, the saved page is shown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { site, queries } = setup();
    const first = await site.zoneReport(newcomer, raid); // first search: pulled now
    const pulls = () => queries.filter((q) => q.includes('zoneRankings')).length;
    const before = pulls();

    vi.setSystemTime(Date.now() + 30 * MINUTE);
    expect((await site.zoneReport(newcomer, raid)).updatedAt).toBe(first.updatedAt);
    expect(pulls()).toBe(before);

    vi.setSystemTime(Date.now() + HOUR);
    const again = await site.zoneReport(newcomer, raid); // searched again: their latest kills
    expect(pulls()).toBe(before + 1);
    expect(again.updatedAt).toBeGreaterThan(first.updatedAt);
  });

  it('does not pull the whole realm on its own: only the #1 list, and characters people search', async () => {
    const { site, puller, queries } = setup();
    await puller.run();
    expect(queries.some((q) => q.includes('c0: character('))).toBe(false); // no batch character pulls
    expect(queries.some((q) => q.includes('serverSlug: $realm') && !q.includes('className: "'))).toBe(false); // no raider discovery
    expect(queries.some((q) => q.includes('className: "'))).toBe(true); // #1 list
    await site.zoneReport(newcomer, raid);
    expect(await site.characterNames('nightslayer')).toContain('Newcomer'); // searched names are suggested
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

  it('pulls each class’s #1 from Warcraft Logs’ realm rankings once, then serves the saved list', async () => {
    const { site, puller, queries } = setup();
    await puller.run(); // the puller fetches the newest raid's list
    const board = await site.leaders('nightslayer');
    expect(board.classes).toHaveLength(9);
    expect(board.classes.find((c) => c.className === 'Warrior')?.leaders.map((l) => [l.name, l.role])).toEqual([
      ['Brannoc', 'damage'],
      ['Brannoc', 'tank'],
    ]);
    expect(board.classes.find((c) => c.className === 'Priest')?.leaders.map((l) => l.role)).toEqual(['damage', 'healing']);
    expect(queries.some((q) => q.includes('className: "Priest", metric: hps'))).toBe(true);
    expect(queries.some((q) => q.includes('className: "Warrior", specName: "Protection", metric: dps'))).toBe(true);
    const before = queries.length;
    await site.leaders('nightslayer');
    expect(queries.length).toBe(before);
  });

  it('pulls the #1 list once a day at 10:00 AM Eastern, never in between', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 6, 15)); // 11:00 AM EDT
    const { site, puller, queries } = setup();
    const pulls = () => queries.filter((q) => q.includes('className: "') && q.includes('serverSlug: $realm')).length;
    await puller.run();
    const first = pulls();
    expect(first).toBeGreaterThan(0);

    vi.setSystemTime(Date.UTC(2026, 9, 7, 13, 30)); // 9:30 AM next day: not yet
    await puller.run();
    await site.leaders('nightslayer');
    expect(pulls()).toBe(first);

    vi.setSystemTime(Date.UTC(2026, 9, 7, 14, 5)); // 10:05 AM: due
    await puller.run();
    expect(pulls()).toBe(first * 2);
    await puller.run();
    expect(pulls()).toBe(first * 2);
  });

  it('a visitor never waits on Warcraft Logs for the #1 list: it comes back empty and is fetched behind the scenes', async () => {
    const { site, queries } = setup();
    const first = await site.leaders('nightslayer', 'black-temple');
    expect(first.updatedAt).toBeNull();
    await vi.waitFor(async () => expect((await site.leaders('nightslayer', 'black-temple')).updatedAt).not.toBeNull());
    expect(queries.some((q) => q.includes('className: "'))).toBe(true);
  });

  it('a #1 lookup Warcraft Logs rejects is skipped; the rest of the list is still saved', async () => {
    const cache = new TtlCache({ serveStale: false, persist: persisted, pack: packSaved });
    const { provider: live } = fakeWcl((query, variables) => {
      if (query.includes('specName: "Guardian"')) throw new Error('Unknown spec Guardian');
      return handler(query, variables);
    }, cache);
    const puller = new Puller(live, cache);
    const site = new SnapshotProvider(live, cache, puller);
    await puller.run();
    const board = await site.leaders('nightslayer');
    expect(board.updatedAt).not.toBeNull();
    const druid = board.classes.find((c) => c.className === 'Druid')!.leaders.map((l) => l.role);
    expect(druid).toEqual(['damage', 'healing']); // no tank, but the rest is there
    expect(board.classes.find((c) => c.className === 'Warrior')!.leaders.map((l) => l.role)).toEqual(['damage', 'tank']);
  });

  it('the admin pull gets the #1 list right away, whatever the time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 9, 6, 15));
    const { site, puller, queries } = setup();
    await puller.run();
    const before = queries.filter((q) => q.includes('serverSlug: $realm') && q.includes('className: "')).length;
    vi.setSystemTime(Date.UTC(2026, 9, 6, 18)); // 2 PM, long after today's 10 AM pull
    const result = await site.pullLeadersNow();
    expect(result.raids).toEqual(['Black Temple', 'Mount Hyjal']); // newest first
    expect(result.classesWithLeaders).toBeGreaterThan(0);
    expect(queries.filter((q) => q.includes('serverSlug: $realm') && q.includes('className: "')).length).toBeGreaterThan(before);
  });

  it('a #1 list asked for while the allowance is used up is pulled on the next pass', async () => {
    const { site, puller, live } = setup();
    const spy = vi.spyOn(live, 'headroom').mockReturnValue(0);
    const waiting = await site.leaders('nightslayer', 'mount-hyjal'); // nothing pulled yet
    expect(waiting.updatedAt).toBeNull();
    spy.mockRestore();
    await puller.run();
    const ready = await site.leaders('nightslayer', 'mount-hyjal');
    expect(ready.updatedAt).not.toBeNull();
    expect(ready.raid?.id).toBe('mount-hyjal');
  });

  it('Refresh with the allowance used up quietly queues the pull and shows the saved page', async () => {
    const { site, puller, live } = setup();
    await puller.run();
    const saved = await site.zoneReport(brannoc, raid);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + HOUR);
    vi.spyOn(live, 'headroom').mockReturnValue(0);
    const shown = await site.refresh(brannoc, raid);
    expect(shown.updatedAt).toBe(saved.updatedAt);
    expect(puller.queue().map((j) => j.ref.name)).toEqual(['Brannoc']);
  });

  it('with RAIDER_SWEEP on, finds everyone who raids on the realms and pulls their pages ahead of time', async () => {
    const { site, puller, queries } = setup({ sweep: true });
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
    const dir = mkdtempSync(join(tmpdir(), 'logsforever-'));
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

  it('keeps fight logs on disk, trimmed, so they are never fetched twice', async () => {
    const { site, cache } = setup();
    await site.compare(newcomer, 601, 'Fury');
    const saved = [...cache.withPrefix<{ amounts: object[] }>('tables2|')];
    expect(saved.length).toBeGreaterThan(0);
    for (const [, t] of saved) for (const e of t.amounts) expect(Object.keys(e).sort()).toEqual(expect.arrayContaining(['guid', 'name', 'total']));
    expect([...cache.withPrefix('side|')].length).toBeGreaterThan(0); // withPrefix only lists what goes to disk
  });

  it('pulls a comparison on first click', async () => {
    const { site, puller } = setup();
    await puller.run();
    const c = await site.compare(brannoc, 601, 'Fury');
    expect(c.ref?.name).toBe('P10');
  });

  it('reports how much of the realm is left to pull', async () => {
    const { puller } = setup({ sweep: true });
    expect(puller.remaining().discovering).toBe(true);
    await puller.run();
    expect(puller.remaining()).toMatchObject({ discovering: false, characters: 0 });
  });
});
