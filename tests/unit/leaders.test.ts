import { describe, expect, it } from 'vitest';
import type { ZoneReport } from '../../shared/types';
import { buildLeaders } from '../../server/core/leaders';

const page = (name: string, className: string, rows: [string, number | null][]) =>
  ({
    character: { name, className },
    rows: rows.map(([spec, rankPercent], i) => ({ encounter: { id: i, name: `Boss ${i}` }, spec, metric: 'dps', kills: 1, best: rankPercent == null ? null : 1000, rankPercent })),
  }) as unknown as ZoneReport;

describe('buildLeaders', () => {
  it('lists every spec, with players who have a 99+ parse, best first', () => {
    const specs = buildLeaders([
      page('Alphac', 'Warrior', [['Fury', 99.5], ['Fury', 99.1], ['Fury', 80]]),
      page('Brannoc', 'Warrior', [['Fury', 99.9], ['Fury', 70], ['Arms', 99]]),
      page('Cindra', 'Warrior', [['Fury', 98.9]]),
      page('Dorn', 'Druid', [['Guardian', 99.2]]),
    ]);
    expect(specs).toHaveLength(27);
    const fury = specs.find((s) => s.className === 'Warrior' && s.spec === 'Fury')!;
    expect(fury.players.map((p) => [p.name, p.topParses])).toEqual([
      ['Alphac', 2],
      ['Brannoc', 1],
    ]);
    expect(specs.find((s) => s.spec === 'Arms')!.players.map((p) => p.name)).toEqual(['Brannoc']);
    expect(specs.find((s) => s.className === 'Druid' && s.spec === 'Feral')!.players.map((p) => p.name)).toEqual(['Dorn']);
    expect(specs.find((s) => s.className === 'Mage' && s.spec === 'Fire')!.players).toEqual([]);
  });
});
