import type { ApiError, Comparison, Meta, Realm, Region, ZoneReport } from '../../shared/types';

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

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`${path}${qs.size ? `?${qs}` : ''}`, { signal });
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok || !body) {
    const err = (body as ApiError | null)?.error;
    throw new RequestError(err?.code ?? 'upstream', err?.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

/** Comparisons are cached for the session and can be started early (on hover) so a click feels instant. */
const comparisons = new Map<string, Promise<Comparison>>();

function compare(q: Query, encounter: number, spec: string): Promise<Comparison> {
  const key = `${q.region}|${q.realm}|${q.name}|${encounter}|${spec}`.toLowerCase();
  let hit = comparisons.get(key);
  if (!hit) {
    hit = get<Comparison>('/api/compare', { ...q, encounter, spec });
    hit.catch(() => comparisons.delete(key));
    comparisons.set(key, hit);
  }
  return hit;
}

const realmLists = new Map<Region, Promise<Realm[]>>();

export const api = {
  meta: () => get<Meta>('/api/meta'),
  realms: (region: Region) => {
    let hit = realmLists.get(region);
    if (!hit) {
      hit = get<Realm[]>('/api/realms', { region });
      hit.catch(() => realmLists.delete(region));
      realmLists.set(region, hit);
    }
    return hit;
  },
  character: (q: Query, raid?: string, signal?: AbortSignal) => get<ZoneReport>('/api/character', { ...q, raid }, signal),
  compare,
  prefetchCompare: (q: Query, encounter: number, spec: string) => void compare(q, encounter, spec).catch(() => undefined),
};
