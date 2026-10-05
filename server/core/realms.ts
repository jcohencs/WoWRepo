import type { Realm, Region, Site } from '../../shared/types.js';

/** Used when the realm list cannot be fetched. */
export const FALLBACK_REALMS: Record<Site, Partial<Record<Region, string[]>>> = {
  fresh: {
    US: ['Dreamscythe', 'Nightslayer', 'Doomhowl', 'Maladath'],
    EU: ['Thunderstrike', 'Spineshatter', 'Soulseeker'],
  },
  classic: {},
};

export function realmList(names: string[]): Realm[] {
  return names.map((name) => ({ name, slug: name.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, '-') }));
}

export function sortRealms(realms: Realm[]): Realm[] {
  const seen = new Set<string>();
  return realms
    .filter((r) => !seen.has(r.slug) && seen.add(r.slug))
    .sort((a, b) => a.name.localeCompare(b.name));
}
