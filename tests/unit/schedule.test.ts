import { describe, expect, it } from 'vitest';
import { lastDailyTime } from '../../server/core/schedule';

const NY = 'America/New_York';

describe('lastDailyTime (10:00 AM Eastern)', () => {
  it('is today at 10:00 once it has passed, yesterday before that', () => {
    // 6 Oct 2026 is daylight time (UTC−4): 10:00 EDT = 14:00 UTC.
    expect(lastDailyTime(Date.UTC(2026, 9, 6, 15, 30), 10, NY)).toBe(Date.UTC(2026, 9, 6, 14));
    expect(lastDailyTime(Date.UTC(2026, 9, 6, 13, 59), 10, NY)).toBe(Date.UTC(2026, 9, 5, 14));
  });

  it('follows standard time in winter', () => {
    // 15 Jan 2027 is standard time (UTC−5): 10:00 EST = 15:00 UTC.
    expect(lastDailyTime(Date.UTC(2027, 0, 15, 15, 1), 10, NY)).toBe(Date.UTC(2027, 0, 15, 15));
    expect(lastDailyTime(Date.UTC(2027, 0, 15, 14, 59), 10, NY)).toBe(Date.UTC(2027, 0, 14, 15));
  });

  it('handles the day after midnight UTC', () => {
    // 01:00 UTC on 7 Oct is 21:00 on 6 Oct in New York.
    expect(lastDailyTime(Date.UTC(2026, 9, 7, 1), 10, NY)).toBe(Date.UTC(2026, 9, 6, 14));
  });
});
