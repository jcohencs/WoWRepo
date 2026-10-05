import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { dirname } from 'node:path';
import { ApiFailure } from './errors.js';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

interface Entry {
  /** When the value should be refreshed. Older values are still served. */
  expires: number;
  fetchedAt: number;
  value: unknown;
}

export interface CacheOptions {
  /** JSON file the cache is kept in between restarts. */
  file?: string | null;
  /**
   * Gzipped JSON snapshot (made by `npm run prefill`) loaded when there is no saved file yet,
   * e.g. on a fresh Render disk. Lets the site start with everyone already pulled.
   */
  seed?: string | null;
  /** Asked before refreshing a stale entry in the background; return false to save the allowance. */
  canRefresh?: () => boolean;
  /**
   * When false, a stale entry is reloaded before returning instead of being served while it
   * refreshes. The scheduled puller uses this so what it saves is always current.
   */
  serveStale?: boolean;
  maxEntries?: number;
}

/**
 * Stale-while-revalidate cache, persisted to disk.
 *
 * - Fresh value: returned.
 * - Stale value: returned immediately, and refreshed in the background when `canRefresh()` allows.
 * - Nothing saved: loaded now (concurrent callers share the one load).
 *
 * So every visitor sees the most recent pull, and only data nobody has asked for before waits on
 * Warcraft Logs.
 */
export class TtlCache {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly file: string | null;
  private readonly canRefresh: () => boolean;
  private readonly maxEntries: number;
  readonly serveStale: boolean;

  constructor(opts: CacheOptions | string | null = {}) {
    const o = typeof opts === 'string' || opts === null ? { file: opts } : opts;
    this.file = o.file ?? null;
    this.canRefresh = o.canRefresh ?? (() => true);
    this.serveStale = o.serveStale ?? true;
    this.maxEntries = o.maxEntries ?? 50_000;
    if (this.file && existsSync(this.file)) {
      try {
        const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, Entry>;
        for (const [k, e] of Object.entries(saved)) this.entries.set(k, { ...e, fetchedAt: e.fetchedAt ?? Date.now() });
      } catch {
        // A corrupt cache file is not worth failing over; start empty.
      }
    }
    if (!this.entries.size && o.seed && existsSync(o.seed)) {
      try {
        const seed = JSON.parse(gunzipSync(readFileSync(o.seed)).toString('utf8')) as Record<string, Entry>;
        for (const [k, e] of Object.entries(seed)) this.entries.set(k, e);
        console.log(`[parsecheck] Started from ${o.seed} (${this.entries.size} saved results).`);
        this.scheduleSave();
      } catch (err) {
        console.error(`[parsecheck] Could not read ${o.seed}: ${err instanceof Error ? err.message : err}`);
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

  /** Any saved value, fresh or not. */
  peekAny<T>(key: string): { value: T; fresh: boolean; fetchedAt: number } | undefined {
    const e = this.entries.get(key);
    return e && { value: e.value as T, fresh: e.expires > Date.now(), fetchedAt: e.fetchedAt };
  }

  fetchedAt(key: string): number | undefined {
    return this.entries.get(key)?.fetchedAt;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    const now = Date.now();
    this.entries.delete(key);
    this.entries.set(key, { expires: now + ttlMs, fetchedAt: now, value });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    this.scheduleSave();
  }

  /** Marks a key stale so the next read refreshes it (the old value is still served). */
  expire(key: string): void {
    const e = this.entries.get(key);
    if (e) e.expires = 0;
  }

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const saved = this.peekAny<T>(key);
    if (saved?.fresh) return saved.value;
    if (saved && this.serveStale) {
      if (this.canRefresh()) void this.load(key, ttlMs, load).catch(() => undefined);
      return saved.value;
    }
    return this.load(key, ttlMs, load);
  }

  /** Loads now, ignoring any saved value; concurrent loads for a key are shared. */
  load<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
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
    }, 1000);
    this.saveTimer.unref?.();
  }

  /** Writes the entries whose keys match to a gzipped JSON file (a seed for another server). */
  exportSeed(file: string, keep: (key: string) => boolean): number {
    const picked = Object.fromEntries([...this.entries].filter(([k]) => keep(k)));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, gzipSync(JSON.stringify(picked)));
    return Object.keys(picked).length;
  }

  flush(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.entries)));
    renameSync(tmp, this.file);
  }
}
