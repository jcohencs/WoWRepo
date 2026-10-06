import { describe, expect, it } from 'vitest';
import type { ZoneReport } from '../../shared/types';
import { buildLeaders } from '../../server/core/leaders';

const page = (name: string, className: string, rows: [string, number, number][]) =>
  ({
    character: { name, className },
    rows: rows.map(([spec, rankPercent, best], i) => ({
      encounter: { id: i, name: `Boss ${i}` },
      spec,
      metric: spec === 'Holy' || spec === 'Restoration' ? 'hps' : 'dps',
      kills: 1,
      best,
      rankPercent,
    })),
  }) as unknown as ZoneReport;

describe('buildLeaders', () => {
  it('picks each class’s #1 by average parse, ignoring one lucky kill', () => {
    const classes = buildLeaders(
      [
        page('Alphac', 'Warrior', [['Fury', 99, 2400], ['Fury', 97, 2200], ['Fury', 95, 2000]]),
        page('Brannoc', 'Warrior', [['Fury', 92, 2100], ['Fury', 90, 2000], ['Arms', 85, 1500], ['Fury', 88, 1900]]),
        page('Lucky', 'Warrior', [['Arms', 100, 2600]]), // one kill only
        page('Dorn', 'Druid', [['Guardian', 70, 900]]),
      ],
      6,
    );
    expect(classes).toHaveLength(9);
    const warrior = classes.find((c) => c.className === 'Warrior')!.leader!;
    expect([warrior.name, warrior.spec, warrior.bosses, warrior.topParses]).toEqual(['Alphac', 'Fury', 3, 1]);
    expect(warrior.averageParse).toBeCloseTo(97);
    expect(warrior.perSecond).toBeCloseTo(2200);
    // Nobody in the class has 3 kills yet, so the best of what there is still shows (Guardian counts as Feral).
    expect(classes.find((c) => c.className === 'Druid')!.leader).toMatchObject({ name: 'Dorn', spec: 'Feral' });
    expect(classes.find((c) => c.className === 'Mage')!.leader).toBeNull();
  });
});
