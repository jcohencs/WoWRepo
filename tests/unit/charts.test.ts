import { describe, expect, it } from 'vitest';
import { raidsFromZones } from '../../server/core/raids';
import { tbcZonesFromExpansions } from '../../server/core/zones';
import { shortBossName } from '../../src/components/ParseChart';

describe('shortBossName', () => {
  it('drops titles and keeps a recognisable word', () => {
    expect(shortBossName("High Warlord Naj'entus")).toBe("Naj'entus");
    expect(shortBossName('The Illidari Council')).toBe('Illidari');
    expect(shortBossName('Mother Shahraz')).toBe('Shahraz');
    expect(shortBossName('Supremus')).toBe('Supremus');
    expect(shortBossName('Illidan Stormrage')).toBe('Illidan');
    expect(shortBossName('Gruul the Dragonkiller')).toBe('Gruul');
  });
});


describe('raidsFromZones', () => {
  const bt = (id: number, name: string) => ({ id, name, encounters: [{ id: 601, name: "High Warlord Naj'entus" }, { id: 609, name: 'Illidan Stormrage' }] });

  it('lists each raid once, skipping the 25-man / full raid listing', () => {
    const raids = raidsFromZones([bt(2011, 'Black Temple'), bt(2018, 'Black Temple (25 Full Raid)'), bt(2005, 'Black Temple')]);
    expect(raids.map((r) => [r.name, r.zoneId])).toEqual([['Black Temple', 2011]]);
  });

  it('keeps a raid that only has a full-raid listing', () => {
    expect(raidsFromZones([bt(2018, 'Black Temple Full Raid')]).map((r) => r.name)).toEqual(['Black Temple']);
  });
});


describe('tbcZonesFromExpansions', () => {
  it('finds TBC raids by their bosses, whatever the expansion is called', () => {
    const zones = tbcZonesFromExpansions([
      { name: 'Anniversary', zones: [{ id: 2018, name: 'Black Temple', encounters: [{ id: 1, name: "High Warlord Naj'entus" }, { id: 2, name: 'Supremus' }] }] },
      { name: 'Classic', zones: [{ id: 1000, name: 'Molten Core', encounters: [{ id: 3, name: 'Lucifron' }, { id: 4, name: 'Ragnaros' }] }] },
      { name: 'Anniversary', zones: [{ id: 2019, name: 'Heroic Dungeons', encounters: [{ id: 5, name: 'Supremus' }, { id: 6, name: 'Gruul' }] }] },
    ]);
    expect(zones.map((z) => z.name)).toEqual(['Black Temple']);
  });
});
