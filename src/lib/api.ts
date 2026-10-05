import type { ApiError, Comparison, Meta, Region, ZoneReport } from '../../shared/types';

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

/** The page hasn't been pulled from Warcraft Logs yet; it's queued for the next scheduled update. */
export class PendingError extends RequestError {
  constructor(
    readonly position: number,
    readonly nextUpdateInSec: number,
  ) {
    super('pending', 'Not pulled yet.');
  }
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  const res = await fetch(`${path}${qs.size ? `?${qs}` : ''}`, { signal });
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (res.status === 202) {
    const p = (body as { pending?: { position: number; nextUpdateInSec: number } } | null)?.pending;
    throw new PendingError(p?.position ?? 1, p?.nextUpdateInSec ?? 600);
  }
  if (!res.ok || !body) {
    const err = (body as ApiError | null)?.error;
    throw new RequestError(err?.code ?? 'upstream', err?.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

/** Comparisons are cached for the session so reopening a boss is instant and free. */
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
  character: (q: Query, raid?: string, signal?: AbortSignal) => get<ZoneReport>('/api/character', { ...q, raid }, signal),
  compare,
};
