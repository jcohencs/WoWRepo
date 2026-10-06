import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../../server/cache';
import { ApiFailure } from '../../server/errors';
import { WclClient, withRateLimit } from '../../server/wcl/client';

const dirs: string[] = [];
const tmpFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'logsforever-'));
  dirs.push(dir);
  return join(dir, 'cache.json');
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('TtlCache', () => {
  it('survives a restart when backed by a file', async () => {
    const file = tmpFile();
    const a = new TtlCache(file);
    await a.get('k', 60_000, async () => ({ n: 1 }));
    a.flush();
    const b = new TtlCache(file);
    let calls = 0;
    expect(await b.get('k', 60_000, async () => (calls++, { n: 2 }))).toEqual({ n: 1 });
    expect(calls).toBe(0);
  });

  it('starts from a seed snapshot when there is no saved file yet', () => {
    const a = new TtlCache();
    a.set('view|zone|x', { ok: 1 }, 60_000);
    a.set('queue', [], 60_000);
    const seed = tmpFile().replace('cache.json', 'seed.json.gz');
    expect(a.exportSeed(seed, (k) => k.startsWith('view|'))).toBe(1);
    const b = new TtlCache({ file: tmpFile(), seed });
    expect(b.peek('view|zone|x')).toEqual({ ok: 1 });
    expect(b.peek('queue')).toBeUndefined();
  });

  it('falls back to an expired value when the allowance is used up', async () => {
    const c = new TtlCache();
    c.set('k', 'old', -1);
    const v = await c.get('k', 60_000, async () => {
      throw new ApiFailure('rate_limited', 'limit');
    });
    expect(v).toBe('old');
  });

  it('still throws other errors on a direct load', async () => {
    const c = new TtlCache();
    c.set('k', 'old', -1);
    await expect(c.load('k', 1, async () => Promise.reject(new ApiFailure('upstream', 'x')))).rejects.toThrow('x');
  });

  it('serves the last pull right away and refreshes it in the background', async () => {
    const c = new TtlCache();
    c.set('k', 'old', -1);
    let resolve!: (v: string) => void;
    const v = await c.get('k', 60_000, () => new Promise<string>((r) => (resolve = r)));
    expect(v).toBe('old');
    resolve('new');
    await new Promise((r) => setTimeout(r, 0));
    expect(c.peek('k')).toBe('new');
  });

  it('skips background refreshes when told to save the allowance', async () => {
    const c = new TtlCache({ canRefresh: () => false });
    c.set('k', 'old', -1);
    let calls = 0;
    expect(await c.get('k', 60_000, async () => (calls++, 'new'))).toBe('old');
    expect(calls).toBe(0);
  });

  it('shares one in-flight load between callers', async () => {
    const c = new TtlCache();
    let calls = 0;
    const load = async () => (calls++, 1);
    await Promise.all([c.get('k', 1000, load), c.get('k', 1000, load)]);
    expect(calls).toBe(1);
  });
});

describe('WclClient rate limit', () => {
  it('adds the rate-limit field to the root of a query', () => {
    expect(withRateLimit('query($a: Int!) { worldData { x } }')).toBe(
      'query($a: Int!) { rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }  worldData { x } }',
    );
  });

  it('stops sending once the hourly allowance is nearly spent', async () => {
    let sent = 0;
    const fetch = (async (url: string) => {
      if (url.endsWith('/oauth/token')) return Response.json({ access_token: 't', expires_in: 3600 });
      sent++;
      return Response.json({ data: { x: 1, rateLimitData: { limitPerHour: 720, pointsSpentThisHour: 715, pointsResetIn: 1200 } } });
    }) as typeof globalThis.fetch;
    const client = new WclClient({ clientId: 'a', clientSecret: 'b', site: 'fresh', fetch });
    await client.query('{ x }');
    expect(client.rateLimit()?.pointsSpentThisHour).toBe(715);
    await expect(client.query('{ x }')).rejects.toMatchObject({ code: 'rate_limited' });
    expect(sent).toBe(1);
  });

  it('after a refusal with no known reset, waits about 5 minutes then tries again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    let calls = 0;
    let refuse = true;
    const fetch = (async (url: string) => {
      if (url.endsWith('/oauth/token')) return Response.json({ access_token: 't', expires_in: 3600 });
      calls++;
      return refuse
        ? new Response('', { status: 429 })
        : Response.json({ data: { x: 1, rateLimitData: { limitPerHour: 720, pointsSpentThisHour: 10, pointsResetIn: 3000 } } });
    }) as typeof globalThis.fetch;
    const client = new WclClient({ clientId: 'a', clientSecret: 'b', site: 'fresh', fetch });
    await expect(client.query('{ x }')).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(client.query('{ x }')).rejects.toThrow(/about 5 minutes/);
    expect(calls).toBe(1); // second call never left the app

    refuse = false;
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1000);
    await expect(client.query('{ x }')).resolves.toBeDefined();
    expect(client.rateLimit()).toMatchObject({ limitPerHour: 720, pointsSpentThisHour: 10 });
    vi.useRealTimers();
  });

});
