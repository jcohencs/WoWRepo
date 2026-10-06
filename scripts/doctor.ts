/**
 * Checks each kind of Warcraft Logs request the site makes, with your key, and prints what works.
 *
 *   npm run doctor
 *   npm run doctor -- --name Yourcharacter
 *
 * Uses its own temporary memory, so it doesn't touch the site's saved data. Paste the output when
 * reporting a problem — it never prints your key.
 */
import { REALM_REGION, REALMS } from '../shared/types.js';
import { TtlCache } from '../server/cache.js';
import { loadWclEnv } from '../server/env.js';
import { WclClient } from '../server/wcl/client.js';
import { WclProvider } from '../server/wcl/provider.js';

const nameArg = (() => {
  const i = process.argv.indexOf('--name');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();

loadWclEnv();
const { WCL_CLIENT_ID: id, WCL_CLIENT_SECRET: secret, WCL_SITE } = process.env;
if (!id || !secret) {
  console.log('✗ No Warcraft Logs key found in .env (WCL_CLIENT_ID / WCL_CLIENT_SECRET).');
  process.exit(1);
}
const site = WCL_SITE === 'classic' ? 'classic' : 'fresh';
const client = new WclClient({ clientId: id, clientSecret: secret, site });
const live = new WclProvider(client, site, new TtlCache({ serveStale: false }));
const realm = REALMS[0];
let failures = 0;

async function step<T>(label: string, run: () => Promise<T>, describe: (v: T) => string): Promise<T | undefined> {
  try {
    const v = await run();
    console.log(`✓ ${label}: ${describe(v)}`);
    return v;
  } catch (err) {
    failures++;
    console.log(`✗ ${label}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

console.log(`Site: ${site}.warcraftlogs.com · realm: ${realm.name}`);
console.log('Tip: stop the site (Ctrl+C) while this runs; both use the same hourly allowance.\n');

await step('Key and allowance', () => client.query<{ rateLimitData: unknown }>('{ worldData { expansions { id } } }').then(() => client.rateLimit()), (r) =>
  r ? `${Math.round(r.pointsSpentThisHour)} of ${r.limitPerHour} points used this hour` : 'ok',
);

const raids = await step('Raid list', () => live.raids(), (rs) => `${rs.length} raids — ${rs.map((r) => `${r.name} (zone ${r.zoneId})`).join(', ')}`);
const latest = raids?.[raids.length - 1];

if (latest) {
  await step(
    `Finding raiders on ${realm.name} (${latest.encounters[0].name})`,
    () => live.realmRankings(REALM_REGION, realm.slug, [{ encounterId: latest.encounters[0].id, metric: 'dps', page: 1 }]),
    ([p]) => `${p.names.length} names on page 1${p.names.length ? ` (e.g. ${p.names.slice(0, 3).join(', ')})` : ''}`,
  );
}

if (!nameArg) {
  console.log('\nAdd --name Yourcharacter to also check a character page and a boss comparison.');
} else if (raids) {
  const ref = { region: REALM_REGION, realm: realm.slug, name: nameArg.charAt(0).toUpperCase() + nameArg.slice(1).toLowerCase() };
  for (const raid of [...raids].reverse()) {
    const report = await step(`${ref.name} — ${raid.name}`, () => live.zoneReport(ref, raid.id), (r) => {
      const killed = r.rows.filter((row) => row.best != null);
      const benched = r.rows.filter((row) => row.benchmark != null).length;
      return `${r.character.race ?? "race unknown"} ${r.character.className}, ${killed.length}/${r.rows.length} bosses killed, top 1% numbers for ${benched}/${r.rows.length}`;
    });
    const kill = report?.rows.find((row) => row.best != null && row.benchmark != null);
    if (kill) {
      await step(`Comparison — ${kill.encounter.name}`, () => live.compare(ref, kill.encounter.id, kill.spec), (c) =>
        `${c.abilities.length} abilities, you ${Math.round(c.you.perSecond)} vs top 1% ${c.ref ? Math.round(c.ref.perSecond) : "n/a"} ${c.metric.toUpperCase()}`,
      );
      break;
    }
  }
}

const r = client.rateLimit();
if (client.lastRefusal) console.log(`\nWarcraft Logs said: ${client.lastRefusal}`);
const used = r && r.limitPerHour > 0 ? ` Allowance used: ${Math.round(r.pointsSpentThisHour)} of ${r.limitPerHour}.` : '';
console.log(`\n${failures ? `${failures} check(s) failed.` : 'All checks passed.'}${used}`);
process.exit(failures ? 1 : 0);
