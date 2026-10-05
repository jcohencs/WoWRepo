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

const zone = { id: 2011, name: 'Black Temple', frozen: false, encounters: [{ id: 601, name: "Naj'entus" }, { id: 602, name: 'Supremus' }] };
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

function handler(query: string) {
  if (query.includes('expansions')) {
    return { worldData: { expansions: [{ id: 1001, name: 'The Burning Crusade', zones: [zone, { id: 9, name: 'Dungeons', encounters: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] }] }] } };
  }
  if (query.includes('zoneRankings')) {
    return {
      characterData: {
        character: {
          name: 'Brannoc',
          classID: 11,
          server: { name: 'Dreamscythe', slug: 'dreamscythe', region: { slug: 'us' } },
          dps: { rankings: [{ encounter: { id: 601, name: "Naj'entus" }, spec: 'Fury', totalKills: 3, rankPercent: 91.2, bestAmount: 2700 }, { encounter: { id: 602, name: 'Supremus' }, totalKills: 0 }] },
          hps: { rankings: [] },
        },
      },
    };
  }
  if (query.includes('characterRankings')) {
    const worldData: Record<string, unknown> = {};
    for (const m of query.matchAll(/(q\d+): encounter\(id: (\d+)\) \{ characterRankings\(.*?page: (\d+)\)/g)) {
      worldData[m[1]] = rankingsPage(Number(m[3]), 1000);
    }
    return { worldData };
  }
  throw new Error(`unexpected query ${query}`);
}

describe('WclProvider', () => {
  it('discovers TBC raid zones and drops non-raids', async () => {
    const { provider } = fakeWcl(handler);
    expect((await provider.zones()).map((z) => z.name)).toEqual(['Black Temple']);
  });

  it('builds the zone report with exact percentiles in three requests', async () => {
    const { provider, queries } = fakeWcl(handler);
    const report = await provider.zoneReport({ region: 'US', realm: 'dreamscythe', name: 'Brannoc' }, 2011);
    expect(report.character.className).toBe('Warrior');
    const [naj, sup] = report.rows;
    expect(naj.spec).toBe('Fury');
    expect(naj.benchmark).toMatchObject({ sampleSize: 1000, p99: 2990, p50: 2500 });
    expect(naj.gap?.absolute).toBe(2700 - 2990);
    expect(sup.best).toBeNull();
    expect(sup.benchmark?.spec).toBe('Fury');
    // zones, character, page-1 batch, percentile-page batch
    expect(queries).toHaveLength(4);
    expect(queries[3]).toContain('page: 5');

    // benchmarks are cached on the second search
    await provider.zoneReport({ region: 'US', realm: 'dreamscythe', name: 'Brannoc' }, 2011);
    expect(queries).toHaveLength(4);
  });
});
