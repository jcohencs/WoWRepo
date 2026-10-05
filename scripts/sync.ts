/**
 * Pre-downloads top 1% / typical-player benchmarks for one class + spec so the app can answer
 * from saved data instead of spending your hourly Warcraft Logs allowance.
 *
 *   npm run sync -- --class Warrior --spec Fury
 *   npm run sync -- --class Priest --spec Shadow --raid "Black Temple,Sunwell Plateau"
 *
 * Safe to run repeatedly: anything already saved is skipped, and it stops by itself when this
 * hour's allowance is nearly used up. Run it again after the reset to continue.
 * Run it while the site is stopped: both write the same saved-data file.
 */
import { loadWclEnv } from '../server/env.js';
import { liveProviderFromEnv } from '../server/handler.js';
import { CLASSES } from '../server/core/classes.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const usage = () => {
  console.log('Usage: npm run sync -- --class <Class> --spec <Spec> [--raid "Raid A,Raid B"]\n');
  for (const c of Object.values(CLASSES)) console.log(`  ${c.name.padEnd(8)} ${c.specs.join(', ')}`);
  process.exit(1);
};

loadWclEnv();
const setup = liveProviderFromEnv();
if (!setup) {
  console.log('No Warcraft Logs key found in .env, so there is nothing to download.');
  process.exit(1);
}
const provider = setup.live;

const className = arg('class');
const spec = arg('spec');
if (!className || !spec) usage();

const raidNames = arg('raid')?.split(',').map((r) => r.trim().toLowerCase());
const raids = await provider.raids();
const raidIds = raidNames ? raids.filter((r) => raidNames.includes(r.name.toLowerCase())).map((r) => r.id) : undefined;
if (raidNames && !raidIds?.length) {
  console.log(`No raid matched. Raids: ${raids.map((r) => r.name).join(', ')}`);
  process.exit(1);
}

console.log(`Downloading ${spec} ${className} benchmarks for ${raidIds ? raidNames!.join(', ') : 'every TBC raid'}…`);
const result = await provider.syncBenchmarks(className!, spec!, raidIds, (done, total) => {
  process.stdout.write(`\r  ${done} / ${total} bosses`);
});
process.stdout.write('\n');

const s = provider.status();
console.log(`Saved ${result.fetched} new, ${result.skipped} already saved.`);
if (s.limitPerHour != null) console.log(`Allowance used this hour: ${s.pointsSpent} of ${s.limitPerHour} points.`);
if (result.remaining > 0) {
  const mins = Math.ceil((s.resetsInSec ?? 3600) / 60);
  console.log(`Stopped to stay under the hourly limit. ${result.remaining} bosses left — run the same command again in ~${mins} minutes.`);
} else {
  console.log('All done. The app will use these saved numbers.');
}
