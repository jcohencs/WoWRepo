import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { forEachEntry, TtlCache } from '../../server/cache';

const dirs: string[] = [];
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), 'logsforever-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Feeds a buffer in tiny pieces so entries and strings are split across reads. */
const pieces = (data: Buffer, size: number) => {
  let at = 0;
  return () => (at >= data.length ? null : data.subarray(at, (at += size)));
};

const entry = (value: unknown) => ({ expires: Date.now() + 60_000, fetchedAt: 1, value });
const tricky = {
  'view|zone|a': entry({ name: 'Brannoc', note: 'braces } { ] [ , and "quotes" \\ é ✓', rows: [{ a: [1, { b: 2 }] }] }),
  'char|US|x': entry({ big: 'raw reply' }),
  'bench|1': entry(null),
  'roster|US|nightslayer': entry({ names: ['A', 'B'] }),
};

describe('saved data file', () => {
  it('reads the old one-object format in small pieces, skipping unwanted keys unparsed', () => {
    const data = Buffer.from(JSON.stringify(tricky));
    for (const size of [1, 3, 7, 64, 100_000]) {
      const got: Record<string, unknown> = {};
      const legacy = forEachEntry(pieces(data, size), (k) => !k.startsWith('char|'), (k, e) => (got[k] = e.value));
      expect(legacy).toBe(true);
      expect(got).toEqual({ 'view|zone|a': tricky['view|zone|a'].value, 'bench|1': null, 'roster|US|nightslayer': { names: ['A', 'B'] } });
    }
  });

  it('reads the line format in small pieces', () => {
    const data = Buffer.from(Object.entries(tricky).map((e) => JSON.stringify(e)).join('\n') + '\n');
    for (const size of [1, 5, 1000]) {
      const got: string[] = [];
      expect(forEachEntry(pieces(data, size), () => true, (k) => got.push(k))).toBe(false);
      expect(got).toEqual(Object.keys(tricky));
    }
  });

  it('converts an old file in place and keeps only what is saved to disk', () => {
    const file = join(dir(), 'wcl.json');
    writeFileSync(file, JSON.stringify(tricky));
    const persist = (k: string) => !k.startsWith('char|');
    const a = new TtlCache({ file, persist });
    expect(a.peek('view|zone|a')).toEqual(tricky['view|zone|a'].value);
    expect(a.peek('char|US|x')).toBeUndefined();
    a.set('char|US|y', { raw: 1 }, 60_000); // memory only
    a.flush();
    expect(readFileSync(file, 'utf8').startsWith('[')).toBe(true);
    const b = new TtlCache({ file, persist });
    expect(b.peek('roster|US|nightslayer')).toEqual({ names: ['A', 'B'] });
    expect(b.peek('char|US|y')).toBeUndefined();
  });

  it('bounds memory-only entries', () => {
    const c = new TtlCache({ persist: (k) => k.startsWith('view|'), maxTransient: 2 });
    c.set('char|1', 1, 60_000);
    c.set('char|2', 2, 60_000);
    c.set('char|3', 3, 60_000);
    c.set('view|1', 1, 60_000);
    expect([c.peek('char|1'), c.peek('char|2'), c.peek('char|3'), c.peek('view|1')]).toEqual([undefined, 2, 3, 1]);
  });

  it('writes and reads a large store in parts', () => {
    const file = join(dir(), 'wcl.json');
    const a = new TtlCache({ file });
    for (let i = 0; i < 5000; i++) a.set(`view|${i}`, { i, pad: 'x'.repeat(400) }, 60_000);
    a.flush();
    const b = new TtlCache({ file });
    expect(b.size).toBe(5000);
    expect(b.peek('view|4999')).toEqual({ i: 4999, pad: 'x'.repeat(400) });
    const seed = join(dir(), 'seed.json.gz');
    expect(a.exportSeed(seed, () => true)).toBe(5000);
    expect(new TtlCache({ seed }).peek('view|1234')).toEqual({ i: 1234, pad: 'x'.repeat(400) });
  });
});
