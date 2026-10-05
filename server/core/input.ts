import type { Region } from '../../shared/types.js';

export const REGIONS: Region[] = ['US', 'EU', 'KR', 'TW', 'CN'];

export interface CharacterRef {
  region: Region;
  realm: string;
  name: string;
}

/** Warcraft Logs server slug: "Pyrewood Village" → "pyrewood-village", "Mal'Ganis" → "malganis". */
export function realmSlug(realm: string): string {
  return realm
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

export function normaliseName(name: string): string {
  const trimmed = name.trim();
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1).toLocaleLowerCase();
}

/** Parses https://fresh.warcraftlogs.com/character/us/dreamscythe/name (any WCL subdomain). */
export function parseCharacterUrl(input: string): CharacterRef | null {
  const match = input
    .trim()
    .match(/warcraftlogs\.com\/character\/([a-z]{2})\/([^/?#]+)\/([^/?#]+)/i);
  if (!match) return null;
  const region = match[1].toUpperCase() as Region;
  if (!REGIONS.includes(region)) return null;
  return {
    region,
    realm: realmSlug(decodeURIComponent(match[2])),
    name: normaliseName(decodeURIComponent(match[3])),
  };
}

export function validateRef(raw: { region?: string; realm?: string; name?: string }): CharacterRef | string {
  const region = (raw.region ?? '').toUpperCase() as Region;
  if (!REGIONS.includes(region)) return `Unknown region "${raw.region ?? ''}"`;
  const realm = realmSlug(raw.realm ?? '');
  if (!realm) return 'Realm is required';
  const name = normaliseName(raw.name ?? '');
  if (!/^\p{L}{2,12}$/u.test(name)) return 'Character names are 2–12 letters';
  return { region, realm, name };
}
