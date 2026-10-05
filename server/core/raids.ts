import type { Raid, Zone } from '../../shared/types.js';

/** Raid instances in progression order, identified by boss names (WCL ids differ between sites). */
const RAIDS: { name: string; bosses: string[] }[] = [
  { name: 'Karazhan', bosses: ['attumen', 'moroes', 'maiden of virtue', 'opera', 'curator', 'illhoof', 'shade of aran', 'netherspite', 'chess', 'malchezaar', 'nightbane'] },
  { name: "Gruul's Lair", bosses: ['maulgar', 'gruul'] },
  { name: "Magtheridon's Lair", bosses: ['magtheridon'] },
  { name: 'Serpentshrine Cavern', bosses: ['hydross', 'lurker', 'leotheras', 'karathress', 'morogrim', 'vashj'] },
  { name: 'Tempest Keep', bosses: ["al'ar", 'alar', 'void reaver', 'solarian', "kael'thas", 'kaelthas'] },
  { name: 'Mount Hyjal', bosses: ['winterchill', 'anetheron', "kaz'rogal", 'kazrogal', 'azgalor', 'archimonde'] },
  { name: 'Black Temple', bosses: ["naj'entus", 'najentus', 'supremus', 'akama', 'teron', 'gurtogg', 'bloodboil', 'reliquary', 'shahraz', 'illidari council', 'illidan'] },
  { name: "Zul'Aman", bosses: ["akil'zon", 'akilzon', 'nalorakk', "jan'alai", 'janalai', 'halazzi', 'malacrass', "zul'jin", 'zuljin'] },
  { name: 'Sunwell Plateau', bosses: ['kalecgos', 'brutallus', 'felmyst', 'eredar twins', 'twins', "m'uru", 'muru', "kil'jaeden", 'kiljaeden'] },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function raidOf(encounterName: string): number {
  const n = encounterName.toLowerCase();
  return RAIDS.findIndex((r) => r.bosses.some((b) => n.includes(b)));
}

/** Splits WCL zones into individual raids, ordered by progression. Unknown bosses keep their zone's name. */
export function raidsFromZones(zones: Zone[]): Raid[] {
  const out: (Raid & { order: number })[] = [];
  for (const zone of zones) {
    const groups = new Map<number, Zone['encounters']>();
    for (const e of zone.encounters) {
      const i = raidOf(e.name);
      groups.set(i, [...(groups.get(i) ?? []), e]);
    }
    for (const [i, encounters] of groups) {
      const name = i >= 0 ? RAIDS[i].name : zone.name;
      out.push({ id: `${zone.id}-${slug(name)}`, name, zoneId: zone.id, encounters, order: i >= 0 ? i : 100 + zone.id });
    }
  }
  return out.sort((a, b) => a.order - b.order).map(({ order: _order, ...raid }) => raid);
}
