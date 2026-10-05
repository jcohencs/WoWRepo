import type { Metric } from '../../shared/types.js';

export interface ClassInfo {
  /** Name used by the Warcraft Logs API (`className` argument). */
  name: string;
  label: string;
  color: string;
  specs: string[];
  healers: string[];
}

/** TBC classes keyed by Warcraft Logs class id. */
export const CLASSES: Record<number, ClassInfo> = {
  2: { name: 'Druid', label: 'Druid', color: '#FF7C0A', specs: ['Balance', 'Feral', 'Guardian', 'Restoration'], healers: ['Restoration'] },
  3: { name: 'Hunter', label: 'Hunter', color: '#AAD372', specs: ['BeastMastery', 'Marksmanship', 'Survival'], healers: [] },
  4: { name: 'Mage', label: 'Mage', color: '#3FC7EB', specs: ['Arcane', 'Fire', 'Frost'], healers: [] },
  6: { name: 'Paladin', label: 'Paladin', color: '#F48CBA', specs: ['Holy', 'Protection', 'Retribution'], healers: ['Holy'] },
  7: { name: 'Priest', label: 'Priest', color: '#FFFFFF', specs: ['Discipline', 'Holy', 'Shadow'], healers: ['Discipline', 'Holy'] },
  8: { name: 'Rogue', label: 'Rogue', color: '#FFF468', specs: ['Assassination', 'Combat', 'Subtlety'], healers: [] },
  9: { name: 'Shaman', label: 'Shaman', color: '#0070DD', specs: ['Elemental', 'Enhancement', 'Restoration'], healers: ['Restoration'] },
  10: { name: 'Warlock', label: 'Warlock', color: '#8788EE', specs: ['Affliction', 'Demonology', 'Destruction'], healers: [] },
  11: { name: 'Warrior', label: 'Warrior', color: '#C69B6D', specs: ['Arms', 'Fury', 'Protection'], healers: [] },
};

export function classById(id: number): ClassInfo | undefined {
  return CLASSES[id];
}

export function classByName(name: string): ClassInfo | undefined {
  const key = name.replace(/\s+/g, '').toLowerCase();
  return Object.values(CLASSES).find((c) => c.name.toLowerCase() === key);
}

export function metricFor(className: string, spec: string): Metric {
  return classByName(className)?.healers.includes(spec) ? 'hps' : 'dps';
}

/** "BeastMastery" → "Beast Mastery" */
export function specLabel(spec: string): string {
  return spec.replace(/([a-z])([A-Z])/g, '$1 $2');
}
