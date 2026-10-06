import { describe, expect, it } from 'vitest';
import { raceFrom } from '../../server/core/race';

describe('raceFrom', () => {
  it('finds the race in the shapes Blizzard profile data comes in', () => {
    expect(raceFrom({ global: { race: { name: 'Blood Elf', id: 10 } } })).toBe('Blood Elf');
    expect(raceFrom({ global: { race: { name: { en_US: 'Tauren' } } } })).toBe('Tauren');
    expect(raceFrom({ race: 'Orc' })).toBe('Orc');
    expect(raceFrom({ profile: { character_race: { id: 11 } } })).toBe('Draenei');
    expect(raceFrom({ race: 5 })).toBe('Undead');
    expect(raceFrom({ race: 'Scourge' })).toBe('Undead');
  });

  it('gives null when there is no profile data', () => {
    expect(raceFrom(null)).toBeNull();
    expect(raceFrom({ equipment: [{ name: 'Warglaive' }] })).toBeNull();
    expect(raceFrom({ race: 'Vulpera' })).toBeNull();
  });
});
