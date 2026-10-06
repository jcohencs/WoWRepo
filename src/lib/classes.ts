import { CLASS_COLORS, specLabel } from './format';

/** TBC classes and specs, in the order the game lists them. */
export const CLASS_LIST: { name: string; specs: string[] }[] = [
  { name: 'Druid', specs: ['Balance', 'Feral', 'Restoration'] },
  { name: 'Hunter', specs: ['BeastMastery', 'Marksmanship', 'Survival'] },
  { name: 'Mage', specs: ['Arcane', 'Fire', 'Frost'] },
  { name: 'Paladin', specs: ['Holy', 'Protection', 'Retribution'] },
  { name: 'Priest', specs: ['Discipline', 'Holy', 'Shadow'] },
  { name: 'Rogue', specs: ['Assassination', 'Combat', 'Subtlety'] },
  { name: 'Shaman', specs: ['Elemental', 'Enhancement', 'Restoration'] },
  { name: 'Warlock', specs: ['Affliction', 'Demonology', 'Destruction'] },
  { name: 'Warrior', specs: ['Arms', 'Fury', 'Protection'] },
];

export const classColor = (name: string) => CLASS_COLORS[name] ?? 'var(--text)';

export const classIconUrl = (name: string) => `https://wow.zamimg.com/images/wow/icons/medium/classicon_${name.toLowerCase()}.jpg`;

/** Wowhead's TBC talent calculator for the class. */
export const talentsUrl = (name: string) => `https://www.wowhead.com/tbc/talent-calc/${name.toLowerCase()}`;

/** Our own guide page for a spec (Guardian is shown under Feral, as in TBC). */
export const guidePath = (name: string, spec: string) =>
  `/guides/${name.toLowerCase()}/${(spec === 'Guardian' ? 'Feral' : spec).toLowerCase()}`;

/** Reads `/guides/<class>/<spec>` back into names; null if the path isn't a known guide. */
export function guideFromPath(path: string): { name: string; spec: string } | null {
  const m = /^\/guides\/([a-z]+)\/([a-z]+)\/?$/.exec(path.toLowerCase());
  if (!m) return null;
  const cls = CLASS_LIST.find((c) => c.name.toLowerCase() === m[1]);
  const spec = cls?.specs.find((s) => s.toLowerCase() === m[2]);
  return cls && spec ? { name: cls.name, spec } : null;
}

export const guideTitle = (name: string, spec: string) => `${specLabel(spec)} ${name}`;
