import { describe, expect, it } from 'vitest';
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
