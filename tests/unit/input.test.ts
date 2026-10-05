import { describe, expect, it } from 'vitest';
import { parseCharacterUrl, realmSlug, validateRef } from '../../server/core/input';

describe('realmSlug', () => {
  it('matches Warcraft Logs server slugs', () => {
    expect(realmSlug('Pyrewood Village')).toBe('pyrewood-village');
    expect(realmSlug("Mal'Ganis")).toBe('malganis');
    expect(realmSlug('  Dreamscythe ')).toBe('dreamscythe');
  });
});

describe('parseCharacterUrl', () => {
  it('reads region, realm and name from any WCL subdomain', () => {
    expect(parseCharacterUrl('https://fresh.warcraftlogs.com/character/us/dreamscythe/brannoc')).toEqual({
      region: 'US',
      realm: 'dreamscythe',
      name: 'Brannoc',
    });
    expect(parseCharacterUrl('classic.warcraftlogs.com/character/eu/pyrewood-village/%C3%A9lune?zone=1011')).toEqual({
      region: 'EU',
      realm: 'pyrewood-village',
      name: 'Élune',
    });
  });
  it('ignores other text', () => {
    expect(parseCharacterUrl('Brannoc')).toBeNull();
    expect(parseCharacterUrl('https://fresh.warcraftlogs.com/reports/abc')).toBeNull();
  });
});

describe('validateRef', () => {
  it('normalises valid input', () => {
    expect(validateRef({ region: 'us', realm: 'Dream Scythe', name: 'bRANNOC' })).toEqual({
      region: 'US',
      realm: 'dream-scythe',
      name: 'Brannoc',
    });
  });
  it('explains what is wrong', () => {
    expect(validateRef({ region: 'XX', realm: 'a', name: 'Bob' })).toMatch(/region/);
    expect(validateRef({ region: 'US', realm: '', name: 'Bob' })).toMatch(/Realm/);
    expect(validateRef({ region: 'US', realm: 'a', name: 'B0b' })).toMatch(/letters/);
  });
});
