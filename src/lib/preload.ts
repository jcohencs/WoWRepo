import type { Leaderboard, Meta } from '../../shared/types';

/** Data the server builds into the page (raid list and the saved #1 list), read once. */
interface Preload {
  meta: Meta | null;
  leaders: Leaderboard | null;
}

let cached: Preload | undefined;

export function preload(): Preload {
  if (cached) return cached;
  try {
    const el = document.getElementById('preload');
    cached = el?.textContent ? (JSON.parse(el.textContent) as Preload) : { meta: null, leaders: null };
  } catch {
    cached = { meta: null, leaders: null };
  }
  return cached;
}
