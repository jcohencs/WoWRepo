/** Minimal TTL cache that also de-duplicates concurrent requests for the same key. */
export class TtlCache {
  private store = new Map<string, { expires: number; value: Promise<unknown> }>();

  constructor(private maxEntries = 2000) {}

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<T>;
    const value = load();
    this.store.set(key, { expires: now + ttlMs, value });
    if (this.store.size > this.maxEntries) this.store.delete(this.store.keys().next().value!);
    try {
      return await value;
    } catch (err) {
      this.store.delete(key);
      throw err;
    }
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
