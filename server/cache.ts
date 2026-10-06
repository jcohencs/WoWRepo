import { closeSync, existsSync, mkdirSync, openSync, readSync, renameSync, writeFileSync, writeSync } from 'node:fs';
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
  /** Which keys are written to disk. Others (raw Warcraft Logs replies) live in memory only. */
  persist?: (key: string) => boolean;
  /** Slims a value before it is kept (on set and on load), e.g. to drop data that is stored elsewhere. */
  pack?: (key: string, value: unknown) => unknown;
  /** Most saved entries kept; the oldest go first. */
  maxEntries?: number;
  /** Most memory-only entries kept; the least recently set go first. */
  maxTransient?: number;
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
  /** Memory-only entries, bounded so a realm-wide pull can't fill the server's memory. */
  private readonly transient = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly file: string | null;
  private readonly canRefresh: () => boolean;
  private readonly maxEntries: number;
  private readonly maxTransient: number;
  private readonly persist: (key: string) => boolean;
  private readonly pack: (key: string, value: unknown) => unknown;
  readonly serveStale: boolean;

  constructor(opts: CacheOptions | string | null = {}) {
    const o = typeof opts === 'string' || opts === null ? { file: opts } : opts;
    this.file = o.file ?? null;
    this.canRefresh = o.canRefresh ?? (() => true);
    this.serveStale = o.serveStale ?? true;
    this.maxEntries = o.maxEntries ?? 500_000;
    this.maxTransient = o.maxTransient ?? 3_000;
    this.persist = o.persist ?? (() => true);
    this.pack = o.pack ?? ((_, v) => v);
    if (this.file && existsSync(this.file)) {
      try {
        const legacy = this.readFile(this.file);
        // Files from older versions were one big JSON object; rewrite them in the new format.
        if (legacy) this.scheduleSave();
      } catch (err) {
        // A corrupt cache file is not worth failing over; start empty.
        console.error(`[logsforever] Could not read saved data (${err instanceof Error ? err.message : err}); starting empty.`);
      }
    }
    if (!this.entries.size && o.seed && existsSync(o.seed)) {
      try {
        const data = gunzipSync(readFileSyncSafe(o.seed));
        forEachEntry(bufferReader(data), this.persist, (k, e) => this.restore(k, e));
        console.log(`[logsforever] Started from ${o.seed} (${this.entries.size} saved results).`);
        this.scheduleSave();
      } catch (err) {
        console.error(`[logsforever] Could not read ${o.seed}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /** Loads a saved file, one entry at a time. Returns true if it was in the old one-object format. */
  private readFile(file: string): boolean {
    const fd = openSync(file, 'r');
    try {
      const legacy = forEachEntry(fileReader(fd), this.persist, (k, e) => this.restore(k, e));
      console.log(`[logsforever] Loaded ${this.entries.size} saved results from ${file}.`);
      return legacy;
    } finally {
      closeSync(fd);
    }
  }

  private restore(key: string, e: Entry) {
    this.entries.set(key, { expires: e.expires, fetchedAt: e.fetchedAt ?? Date.now(), value: this.pack(key, e.value) });
  }

  private mapFor(key: string) {
    return this.persist(key) ? this.entries : this.transient;
  }

  get size(): number {
    return this.entries.size + this.transient.size;
  }

  /** Fresh value for a key, if there is one. */
  peek<T>(key: string): T | undefined {
    const e = this.mapFor(key).get(key);
    return e && e.expires > Date.now() ? (e.value as T) : undefined;
  }

  /** Any saved value, fresh or not. */
  peekAny<T>(key: string): { value: T; fresh: boolean; fetchedAt: number } | undefined {
    const e = this.mapFor(key).get(key);
    return e && { value: e.value as T, fresh: e.expires > Date.now(), fetchedAt: e.fetchedAt };
  }

  fetchedAt(key: string): number | undefined {
    return this.mapFor(key).get(key)?.fetchedAt;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    const now = Date.now();
    const persisted = this.persist(key);
    const map = persisted ? this.entries : this.transient;
    map.delete(key);
    map.set(key, { expires: now + ttlMs, fetchedAt: now, value: this.pack(key, value) });
    const max = persisted ? this.maxEntries : this.maxTransient;
    while (map.size > max) map.delete(map.keys().next().value!);
    if (persisted) this.scheduleSave();
  }

  /** Saved values whose key starts with `prefix` (saved-to-disk entries only). */
  *withPrefix<T>(prefix: string): Generator<[string, T]> {
    for (const [k, e] of this.entries) if (k.startsWith(prefix)) yield [k, e.value as T];
  }

  /** Removes every entry whose key starts with `prefix`. */
  deletePrefix(prefix: string): number {
    let n = 0;
    for (const map of [this.entries, this.transient]) {
      for (const k of [...map.keys()]) if (k.startsWith(prefix) && map.delete(k)) n++;
    }
    if (n) this.scheduleSave();
    return n;
  }

  delete(key: string): void {
    if (this.mapFor(key).delete(key) && this.persist(key)) this.scheduleSave();
  }

  /** Marks a key stale so the next read refreshes it (the old value is still served). */
  expire(key: string): void {
    const e = this.mapFor(key).get(key);
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
        const stale = this.mapFor(key).get(key);
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

  /** Writes the entries whose keys match to a gzipped file (a seed for another server). */
  exportSeed(file: string, keep: (key: string) => boolean): number {
    mkdirSync(dirname(file), { recursive: true });
    // Gzip in parts and join them (a valid multi-part gzip file) so the whole store is never one string.
    const parts: Buffer[] = [];
    let count = 0;
    eachChunk(this.entries, keep, (chunk, n) => {
      parts.push(gzipSync(chunk));
      count += n;
    });
    writeFileSync(file, Buffer.concat(parts));
    return count;
  }

  /** Saves to disk: one entry per line, written in parts, so memory use stays flat however much is saved. */
  flush(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    const fd = openSync(tmp, 'w');
    try {
      eachChunk(this.entries, () => true, (chunk) => writeSync(fd, chunk));
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.file);
  }
}

const CHUNK = 1 << 20;

function eachChunk(entries: Map<string, Entry>, keep: (key: string) => boolean, write: (chunk: string, count: number) => void) {
  let buf = '';
  let n = 0;
  for (const [k, e] of entries) {
    if (!keep(k)) continue;
    buf += JSON.stringify([k, e]) + '\n';
    n++;
    if (buf.length >= CHUNK) {
      write(buf, n);
      buf = '';
      n = 0;
    }
  }
  if (buf) write(buf, n);
}

function readFileSyncSafe(file: string): Buffer {
  const fd = openSync(file, 'r');
  try {
    const parts: Buffer[] = [];
    for (;;) {
      const b = Buffer.alloc(CHUNK);
      const n = readSync(fd, b, 0, CHUNK, null);
      if (!n) break;
      parts.push(b.subarray(0, n));
    }
    return Buffer.concat(parts);
  } finally {
    closeSync(fd);
  }
}

/** Returns the next piece of the input, or null at the end. */
type Reader = () => Buffer | null;

function fileReader(fd: number): Reader {
  return () => {
    const b = Buffer.alloc(CHUNK);
    const n = readSync(fd, b, 0, CHUNK, null);
    return n ? b.subarray(0, n) : null;
  };
}

function bufferReader(data: Buffer): Reader {
  let at = 0;
  return () => {
    if (at >= data.length) return null;
    const b = data.subarray(at, at + CHUNK);
    at += CHUNK;
    return b;
  };
}

/**
 * Reads saved entries one at a time, never holding the whole input as a string. Understands the
 * current format (one `[key, entry]` per line) and the old one (a single `{key: entry, …}` object).
 * Entries whose key `want` rejects are skipped without being parsed. Returns true for the old format.
 */
export function forEachEntry(read: Reader, want: (key: string) => boolean, take: (key: string, e: Entry) => void): boolean {
  let first = read();
  while (first && !first.toString('latin1').trim()) first = read();
  if (!first) return false;
  const lead = first.toString('latin1').trimStart()[0];
  if (lead === '{') {
    scanObject(first, read, want, take);
    return true;
  }
  let rest: Buffer = Buffer.alloc(0);
  for (let chunk: Buffer | null = first; chunk; chunk = read()) {
    let data = rest.length ? Buffer.concat([rest, chunk]) : chunk;
    let nl: number;
    while ((nl = data.indexOf(10)) !== -1) {
      const line = data.subarray(0, nl).toString('utf8');
      data = data.subarray(nl + 1);
      if (!line.trim()) continue;
      const [k, e] = JSON.parse(line) as [string, Entry];
      if (want(k)) take(k, e);
    }
    rest = Buffer.from(data);
  }
  const last = rest.toString('utf8').trim();
  if (last) {
    const [k, e] = JSON.parse(last) as [string, Entry];
    if (want(k)) take(k, e);
  }
  return false;
}

/** Splits a top-level JSON object into its members by tracking strings and nesting, byte by byte. */
function scanObject(first: Buffer, read: Reader, want: (key: string) => boolean, take: (key: string, e: Entry) => void) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  let parts: Buffer[] = [];
  let partLen = 0;
  let skip: boolean | null = null; // decided once the member's key is known
  const finish = () => {
    if (partLen && skip === false) {
      const text = Buffer.concat(parts).toString('utf8').trim();
      if (text) {
        const obj = JSON.parse(`{${text}}`) as Record<string, Entry>;
        for (const [k, e] of Object.entries(obj)) take(k, e);
      }
    }
    parts = [];
    partLen = 0;
    skip = null;
  };
  const decide = () => {
    if (skip !== null) return;
    const head = Buffer.concat(parts).toString('utf8');
    const m = /^\s*"((?:[^"\\]|\\.)*)"\s*:/.exec(head);
    if (m) skip = !want(JSON.parse(`"${m[1]}"`) as string);
  };
  for (let chunk: Buffer | null = first; chunk; chunk = read()) {
    let from = 0;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === 92) esc = true;
        else if (c === 34) inStr = false;
        continue;
      }
      if (c === 34) inStr = true;
      else if (c === 123 || c === 91) {
        if (c === 123 && depth === 0) {
          depth = 1;
          from = i + 1;
          continue;
        }
        if (depth === 1) {
          // The member's value starts: its key is complete, so decide whether to keep it.
          const piece = chunk.subarray(from, i);
          if (skip !== false) {
            parts.push(Buffer.from(piece));
            partLen += piece.length;
            decide();
            if (skip) {
              parts = [];
            }
          } else {
            parts.push(Buffer.from(piece));
            partLen += piece.length;
          }
          from = i;
        }
        depth++;
      } else if (c === 125 || c === 93) {
        depth--;
        if (depth === 0) {
          if (skip === false || skip === null) parts.push(Buffer.from(chunk.subarray(from, i)));
          partLen += i - from;
          if (skip === null) decide();
          finish();
          return;
        }
      } else if (c === 44 && depth === 1) {
        if (skip === false || skip === null) parts.push(Buffer.from(chunk.subarray(from, i)));
        partLen += i - from;
        if (skip === null) decide();
        finish();
        from = i + 1;
      }
    }
    if (from < chunk.length && skip !== true) {
      parts.push(Buffer.from(chunk.subarray(from)));
      partLen += chunk.length - from;
    }
  }
}
