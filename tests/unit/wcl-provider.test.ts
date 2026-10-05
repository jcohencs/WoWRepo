import { describe, expect, it } from 'vitest';
import { WclClient } from '../../server/wcl/client';
import { WclProvider } from '../../server/wcl/provider';

type Handler = (query: string, variables: Record<string, unknown>) => unknown;

/** Fake fetch for the token endpoint + GraphQL endpoint; records every query. */
function fakeWcl(handler: Handler) {
  const queries: string[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    if (url.endsWith('/oauth/token')) return Response.json({ access_token: 't', expires_in: 3600 });
    const { query, variables } = JSON.parse(String(init.body));
    queries.push(query);
    return Response.json({ data: handler(query, variables) });
  }) as typeof globalThis.fetch;
  const provider = new WclProvider(new WclClient({ clientId: 'a', clientSecret: 'b', site: 'fresh', fetch }), 'fresh');
  return { provider, queries };
}

const zone = {
  id: 2011,
  name: 'Black Temple / Hyjal',
  frozen: false,
  encounters: [
    { id: 618, name: 'Rage Winterchill' },
    { id: 601, name: "High Warlord Naj'entus" },
    { id: 602, name: 'Supremus' },
  ],
};
const ranking = (rank: number) => ({
  name: `P${rank}`,
  amount: 3000 - rank,
  duration: 100000,
  report: { code: `R${rank}`, fightID: 7 },
  server: { name: 'Dreamscythe' },
});
const rankingsPage = (page: number, count: number) => ({
  characterRankings: { page, count, hasMorePages: true, rankings: Array.from({ length: 100 }, (_, i) => ranking((page - 1) * 100 + i + 1)) },
});
const table = (entries: object[]) => ({ data: { totalTime: 120000, entries } });

function handler(query: string, variables: Record<string, unknown>) {
  if (query.includes('expansions')) {
    return { worldData: { expansions: [{ id: 1001, name: 'The Burning Crusade', zones: [zone, { id: 9, name: 'Dungeons', encounters: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] }] }] } };
  }
  if (query.includes('zoneRankings')) {
    return {
      characterData: {
        character: {
          name: 'Brannoc',
          classID: 11,
          server: { name: 'Dreamscythe', slug: 'dreamscythe' },
          dps: {
            rankings: [
              { encounter: { id: 601, name: "Naj'entus" }, spec: 'Fury', totalKills: 3, rankPercent: 91.2, bestAmount: 2700 },
              { encounter: { id: 602, name: 'Supremus' }, totalKills: 0 },
            ],
          },
          hps: { rankings: [] },
        },
      },
    };
  }
  if (query.includes('encounterRankings')) {
    return { characterData: { character: { e0: { ranks: [{ amount: 2700, duration: 1, report: { code: 'MINE', fightID: 3 } }] } } } };
  }
  if (query.includes('characterRankings')) {
    const worldData: Record<string, unknown> = {};
    for (const m of query.matchAll(/(q\d+): encounter\(id: (\d+)\) \{ characterRankings\(.*?page: (\d+)\)/g)) {
      worldData[m[1]] = rankingsPage(Number(m[3]), 1000);
    }
    return { worldData };
  }
  if (query.includes('players: table')) {
    const name = variables.code === 'MINE' ? 'Brannoc' : 'P10';
    return {
      reportData: {
        report: { fights: [{ id: variables.fight, startTime: 0, endTime: 120000 }], players: table([{ name, id: 5, total: 300000, activeTime: 114000 }]) },
      },
    };
  }
  if (query.includes('amounts: table')) {
    return {
      reportData: {
        report: {
          amounts: table([{ guid: 1, name: 'Melee', total: 200000 }, { guid: 30335, name: 'Bloodthirst', total: 100000 }]),
          casts: table([{ guid: 30335, name: 'Bloodthirst', total: 20 }]),
        },
      },
    };
  }
  throw new Error(`unexpected query ${query}`);
}

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

  it('opens a comparison without re-looking-up the best kill, loading both logs', async () => {
    const { provider, queries } = fakeWcl(handler);
    await provider.zoneReport(brannoc, '2011-black-temple');
    await new Promise((r) => setTimeout(r, 0)); // let the background warm-up land
    const before = queries.length;
    const c = await provider.compare(brannoc, 601, 'Fury');
    const used = queries.slice(before);
    expect(used.some((q) => q.includes('encounterRankings'))).toBe(false);
    expect(used).toHaveLength(4); // 2 per side, run in parallel
    expect(c.you.name).toBe('Brannoc');
    expect(c.ref.name).toBe('P10');
    expect(c.you.activeTime).toBeCloseTo(0.95);
    expect(c.abilities.map((a) => a.name)).toEqual(['Melee', 'Bloodthirst']);

    await provider.compare(brannoc, 601, 'Fury');
    expect(queries.length).toBe(before + 4);
  });
});
