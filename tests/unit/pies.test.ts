import { describe, expect, it } from 'vitest';
import type { AbilityLine } from '../../shared/types';
import { buildSlices, SLICE_COLORS } from '../../src/components/AbilityPies';

const line = (id: number, you: number, ref: number): AbilityLine => ({
  id,
  name: `A${id}`,
  icon: '',
  you: you ? { amount: 0, share: you, casts: 0, cpm: 0 } : null,
  ref: ref ? { amount: 0, share: ref, casts: 0, cpm: 0 } : null,
  shareDelta: you - ref,
});

describe('buildSlices', () => {
  it('keeps the top five by the top 1% share and folds the rest into one grey slice', () => {
    const slices = buildSlices([
      line(1, 0.4, 0.45),
      line(2, 0.2, 0.15),
      line(3, 0.1, 0.12),
      line(4, 0.1, 0.1),
      line(5, 0.08, 0.08),
      line(6, 0.07, 0.06),
      line(7, 0.05, 0.04),
      line(8, 0, 0), // utility: no share, no slice
    ]);
    expect(slices.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 'other']);
    expect(slices.slice(0, 5).map((s) => s.color)).toEqual(SLICE_COLORS);
    expect(slices[5].you).toBeCloseTo(0.12);
    expect(slices[5].ref).toBeCloseTo(0.1);
  });

  it('has no "other" slice when everything fits', () => {
    expect(buildSlices([line(1, 0.6, 0.5), line(2, 0.4, 0.5)]).map((s) => s.id)).toEqual([1, 2]);
  });
});
