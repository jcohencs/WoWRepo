/** A fake Warcraft Logs API for tests: token endpoint + GraphQL, recording every query. */
import { TtlCache } from '../../server/cache';
import { WclClient } from '../../server/wcl/client';
import { WclProvider } from '../../server/wcl/provider';

type Handler = (query: string, variables: Record<string, unknown>) => unknown;

/** Fake fetch for the token endpoint + GraphQL endpoint; records every query. */
export function fakeWcl(handler: Handler, cache = new TtlCache()) {
  const queries: string[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    if (url.endsWith('/oauth/token')) return Response.json({ access_token: 't', expires_in: 3600 });
    const { query, variables } = JSON.parse(String(init.body));
    queries.push(query);
    return Response.json({ data: handler(query, variables) });
  }) as typeof globalThis.fetch;
  const provider = new WclProvider(new WclClient({ clientId: 'a', clientSecret: 'b', site: 'fresh', fetch }), 'fresh', cache);
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

export function handler(query: string, variables: Record<string, unknown>) {
  if (query.includes('c0: character(')) {
    const characterData: Record<string, unknown> = {};
    for (const m of query.matchAll(/(c\d+): character\(name: \$n(\d+)/g)) {
      const name = variables[`n${m[2]}`] as string;
      characterData[m[1]] =
        name === 'Nobody'
          ? null
          : {
              name,
              classID: 11,
              server: { name: 'Dreamscythe', slug: 'dreamscythe' },
              dps: { rankings: [{ encounter: { id: 601, name: "Naj'entus" }, spec: 'Fury', totalKills: 1, rankPercent: 50, bestAmount: 2500 }] },
              hps: { rankings: [] },
            };
    }
    return { characterData };
  }
  if (query.includes('expansions')) {
    return { worldData: { expansions: [{ id: 1001, name: 'The Burning Crusade', zones: [zone, { id: 9, name: 'Dungeons', encounters: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] }] }] } };
  }
  if (query.includes('zoneRankings') && variables.name === 'Nobody') return { characterData: { character: null } };
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
  if (query.includes('ranks: encounterRankings')) {
    return {
      characterData: {
        character: {
          name: 'Brannoc',
          classID: 11,
          server: { name: 'Dreamscythe' },
          ranks: { ranks: [{ amount: 2700, duration: 1, report: { code: 'MINE', fightID: 3 } }] },
        },
      },
    };
  }
  if (query.includes('serverSlug: $realm')) {
    // Realm-filtered rankings: two raiders on Nightslayer.
    const names = variables.realm === 'nightslayer' ? ['Brannoc', 'Morwenna'] : [];
    const worldData: Record<string, unknown> = {};
    for (const m of query.matchAll(/(q\d+): encounter/g)) {
      // Best first: Brannoc then Morwenna, both Fury, in different logs.
      worldData[m[1]] = {
        characterRankings: {
          page: 1,
          hasMorePages: false,
          rankings: names.map((name, i) => ({ ...ranking(1), name, amount: 2999 - i * 100, spec: 'Fury', report: { code: `REALM${i}`, fightID: 7 } })),
        },
      };
    }
    return { worldData };
  }
  if (query.includes('characterRankings')) {
    const worldData: Record<string, unknown> = {};
    for (const m of query.matchAll(/(q\d+): encounter\(id: (\d+)\) \{ characterRankings\(.*?page: (\d+)\)/g)) {
      worldData[m[1]] = rankingsPage(Number(m[3]), 1000);
    }
    return { worldData };
  }
  if (query.includes('players: table')) {
    // Every player the fakes rank appears in every log.
    const players = ['Brannoc', 'Morwenna', 'Newcomer', 'P10'].map((name, i) => ({ name, id: 5 + i, total: 300000 - i * 10000, activeTime: 114000 }));
    return {
      reportData: {
        report: { fights: [{ id: variables.fight, startTime: 0, endTime: 120000 }], players: table(players) },
      },
    };
  }
  if (query.includes('graph: graph(')) {
    return {
      reportData: {
        report: {
          graph: { data: { series: [{ name: 'Total', pointStart: 0, pointInterval: 1000, data: [1, 2, 3, 4] }] } },
          taken: table([{ name: 'Melee', type: 1, total: 60000 }]),
          buffs: { data: { totalTime: 120000, auras: [{ name: 'Well Fed', totalUptime: 120000 }] } },
        },
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

