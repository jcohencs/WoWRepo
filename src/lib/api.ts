import type { ApiError, Comparison, Leaderboard, Meta, Region, SideExtras, ZoneReport } from '../../shared/types';

export interface Query {
  region: Region;
  realm: string;
  name: string;
}

export class RequestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal, method = 'GET'): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`${path}${qs.size ? `?${qs}` : ''}`, { signal, method });
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok || !body) {
    const err = (body as ApiError | null)?.error;
    throw new RequestError(err?.code ?? 'upstream', err?.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

/** Comparisons are cached for the session so reopening a boss is instant and free. */
const comparisons = new Map<string, Promise<Comparison>>();

function compare(q: Query, encounter: number, spec: string, week?: number): Promise<Comparison> {
  const key = `${q.region}|${q.realm}|${q.name}|${encounter}|${spec}|${week ?? ''}`.toLowerCase();
  let hit = comparisons.get(key);
  if (!hit) {
    hit = get<Comparison>('/api/compare', { ...q, encounter, spec, week });
    hit.catch(() => comparisons.delete(key));
    comparisons.set(key, hit);
  }
  return hit;
}

/** True while a comparison is still missing its extra charts (they load when scrolled to). */
export const needsExtras = (c: Comparison) => c.you.timeline === undefined && c.you.taken === undefined && c.you.prep === undefined;

/** Fetches the extra charts and keeps the session copy of the comparison up to date. */
async function compareExtras(q: Query, c: Comparison, week?: number): Promise<Comparison> {
  const extras = await get<{ you: SideExtras; ref: SideExtras | null }>('/api/compare-extras', { ...q, encounter: c.encounter.id, spec: c.spec, week });
  const merged: Comparison = { ...c, you: { ...c.you, ...extras.you }, ref: c.ref ? { ...c.ref, ...(extras.ref ?? {}) } : null };
  const key = `${q.region}|${q.realm}|${q.name}|${c.encounter.id}|${c.spec}|${week ?? ''}`.toLowerCase();
  comparisons.set(key, Promise.resolve(merged));
  return merged;
}

const nameLists = new Map<string, Promise<string[]>>();

export const api = {
  /** Every character the site has on a realm, for search suggestions. */
  names: (realm: string) => {
    let hit = nameLists.get(realm);
    if (!hit) {
      hit = get<string[]>('/api/characters', { realm });
      hit.catch(() => nameLists.delete(realm));
      nameLists.set(realm, hit);
    }
    return hit;
  },
  meta: () => get<Meta>('/api/meta'),
  leaders: (realm: string, raid?: string) => get<Leaderboard>('/api/leaders', { realm, raid }),
  character: (q: Query, raid?: string, spec?: string, signal?: AbortSignal) =>
    get<ZoneReport>('/api/character', { ...q, raid, spec }, signal),
  compare,
  compareExtras,
  /** Pulls the character again now; their comparisons are re-fetched on the next click. */
  refresh: (q: Query, raid?: string, spec?: string) => {
    const who = `${q.region}|${q.realm}|${q.name}|`.toLowerCase();
    for (const k of [...comparisons.keys()]) if (k.startsWith(who)) comparisons.delete(k);
    return get<ZoneReport>('/api/refresh', { ...q, raid, spec }, undefined, 'POST');
  },
};
