import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ApiFailure } from './errors.js';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

interface Entry {
  expires: number;
  value: unknown;
}

/**
 * TTL cache that de-duplicates concurrent loads and, when given a file, keeps its entries on disk
 * so restarts don't spend Warcraft Logs points again. Expired entries are kept as a fallback:
 * if a refresh fails because the hourly limit is used up, the last good value is returned.
 */
export class TtlCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly file: string | null = null,
    private readonly maxEntries = 20_000,
  ) {
    if (file && existsSync(file)) {
      try {
        const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Entry>;
        for (const [k, e] of Object.entries(saved)) this.entries.set(k, e);
      } catch {
        // A corrupt cache file is not worth failing over; start empty.
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }

  /** Fresh value for a key, if there is one. */
  peek<T>(key: string): T | undefined {
    const e = this.entries.get(key);
    return e && e.expires > Date.now() ? (e.value as T) : undefined;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { expires: Date.now() + ttlMs, value });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    this.scheduleSave();
  }

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const fresh = this.peek<T>(key);
    if (fresh !== undefined) return fresh;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const run = (async () => {
      try {
        const value = await load();
        this.set(key, value, ttlMs);
        return value;
      } catch (err) {
        const stale = this.entries.get(key);
        if (stale && err instanceof ApiFailure && err.code === 'rate_limited') return stale.value as T;
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, run);
    return run;
  }

  private scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 500);
    this.saveTimer.unref?.();
  }

  flush(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries)));
    renameSync(tmp, this.file);
  }
}
