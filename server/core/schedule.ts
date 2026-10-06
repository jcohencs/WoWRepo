/** Milliseconds a time zone is ahead of UTC at a given moment (negative for the Americas). */
function zoneOffset(at: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(at))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - (at - (at % 1000));
}

/**
 * The most recent time it was `hour`:00 in `timeZone` (e.g. 10:00 AM in New York), as epoch ms.
 * Daylight saving is handled by the time zone database.
 */
export function lastDailyTime(now: number, hour: number, timeZone: string): number {
  const local = new Date(now + zoneOffset(now, timeZone));
  let candidate = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour);
  candidate -= zoneOffset(candidate, timeZone);
  if (candidate > now) {
    const prev = new Date(now + zoneOffset(now, timeZone) - 24 * 3600_000);
    candidate = Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate(), hour);
    candidate -= zoneOffset(candidate, timeZone);
  }
  return candidate;
}
