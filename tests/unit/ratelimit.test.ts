import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TtlCache } from '../../server/cache';
import { ApiFailure } from '../../server/errors';
import { WclClient, withRateLimit } from '../../server/wcl/client';

const dirs: string[] = [];
const tmpFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'parsecheck-'));
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

  it('treats HTTP 429 as used up until the reset', async () => {
    const fetch = (async (url: string) =>
      url.endsWith('/oauth/token') ? Response.json({ access_token: 't', expires_in: 3600 }) : new Response('', { status: 429 })) as typeof globalThis.fetch;
    const client = new WclClient({ clientId: 'a', clientSecret: 'b', site: 'fresh', fetch });
    await expect(client.query('{ x }')).rejects.toMatchObject({ code: 'rate_limited' });
  });
});
