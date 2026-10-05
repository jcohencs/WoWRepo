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

export const api = {
  meta: () => get<Meta>('/api/meta'),
  character: (q: Query, zone?: number, signal?: AbortSignal) => get<ZoneReport>('/api/character', { ...q, zone }, signal),
  compare: (q: Query, encounter: number, spec: string, signal?: AbortSignal) =>
    get<Comparison>('/api/compare', { ...q, encounter, spec }, signal),
};
