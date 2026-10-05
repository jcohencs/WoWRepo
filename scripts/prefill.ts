/**
 * Pulls everyone raiding on the realm — every character's page for every released raid — and
 * keeps going across hourly resets until it's all saved. Then writes data/seed-<site>.json.gz,
 * which you commit so the website (e.g. on Render) starts with everyone already there.
 *
 *   npm run prefill
 *
 * Stop the website while this runs (they share the hourly allowance). It's safe to stop with
 * Ctrl+C and run again later: everything already saved is kept and skipped.
 */
export {};

process.env.SWEEP_RESERVE ??= '0.03'; // use nearly the whole allowance; nobody else is using it

const { MINUTE } = await import('../server/cache.js');
const { loadWclEnv } = await import('../server/env.js');
const { liveProviderFromEnv } = await import('../server/handler.js');
const { Puller } = await import('../server/snapshot.js');
const { seedFile } = await import('../server/wcl/provider.js');

loadWclEnv();
const setup = liveProviderFromEnv();
if (!setup) {
  console.log('No Warcraft Logs key found in .env.');
  process.exit(1);
}
const { live, cache } = setup;
const puller = new Puller(live, cache);
const started = Date.now();
const startLeft = puller.remaining();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (ms: number) => {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return h ? `${h}h ${m}m` : `${m}m`;
};

for (;;) {
  await puller.run();
  const left = puller.remaining();
  const progress = puller.progress().map((p) => `${p.realm}: ${p.characters} raiders found`).join(', ');
  const done = left.total - left.characters;
  console.log(`[${new Date().toLocaleTimeString()}] ${progress}. Pages: ${done}/${left.total} raid tiers pulled.${left.discovering ? ' Still finding raiders…' : ''}`);

  if (!left.discovering && left.characters === 0) break;

  // Estimate time left from the pace so far.
  const pulled = startLeft.characters - left.characters;
  if (pulled > 0 && !left.discovering) {
    const perMs = pulled / (Date.now() - started);
    console.log(`   About ${fmt(left.characters / perMs)} to go at the current pace.`);
  }

  const status = live.status();
  const wait = status.resetsInSec && live.headroom() < 0.1 ? status.resetsInSec * 1000 + 30_000 : MINUTE;
  if (wait > MINUTE) console.log(`   Allowance used up for this hour; waiting ${fmt(wait)} for the reset…`);
  await sleep(wait);
}

cache.flush();
const keep = (k: string) => /^(view\|zone\||roster\||raids-v1|zones-v2|bench\|)/.test(k);
const count = cache.exportSeed(seedFile(live.site), keep);
console.log(`\nDone in ${fmt(Date.now() - started)}. Wrote ${count} saved results to data/seed-${live.site}.json.gz.`);
console.log('Commit and push that file; a fresh server starts from it instead of an empty slate:');
console.log(`  git add data/seed-${live.site}.json.gz && git commit -m "Update data snapshot" && git push`);
process.exit(0);
