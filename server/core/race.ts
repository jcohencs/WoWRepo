/** Races in TBC, used to recognise a race name wherever the profile data keeps it. */
const RACES = ['Human', 'Dwarf', 'Night Elf', 'Gnome', 'Draenei', 'Orc', 'Undead', 'Tauren', 'Troll', 'Blood Elf'];
/** Blizzard race ids → names, for profile data that only has the id. */
const RACE_IDS: Record<number, string> = { 1: 'Human', 2: 'Orc', 3: 'Dwarf', 4: 'Night Elf', 5: 'Undead', 6: 'Tauren', 7: 'Gnome', 8: 'Troll', 10: 'Blood Elf', 11: 'Draenei' };

const known = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const hit = RACES.find((r) => r.toLowerCase() === v.trim().toLowerCase().replace('scourge', 'undead'));
  return hit ?? null;
};

/**
 * The character's race from the Blizzard profile data Warcraft Logs stores (`gameData`). The
 * exact layout isn't documented, so this looks for a `race` entry a few levels down, as a name
 * ("Orc"), a localised name ({ en_US: "Orc" }), an object with a name, or an id.
 */
export function raceFrom(gameData: unknown, depth = 0): string | null {
  if (!gameData || typeof gameData !== 'object' || depth > 4) return null;
  const obj = gameData as Record<string, unknown>;
  for (const key of ['race', 'character_race', 'playable_race']) {
    const v = obj[key];
    if (v == null) continue;
    const direct = known(v);
    if (direct) return direct;
    if (typeof v === 'number' && RACE_IDS[v]) return RACE_IDS[v];
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const name = o.name;
      const fromName = known(name) ?? (name && typeof name === 'object' ? known((name as Record<string, unknown>).en_US) : null);
      if (fromName) return fromName;
      if (typeof o.id === 'number' && RACE_IDS[o.id]) return RACE_IDS[o.id];
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = raceFrom(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
