import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Comparison, Meta, ZoneReport } from '../../shared/types';
import { DemoProvider } from '../../server/demo/provider';
import { createApiHandler, providerFromEnv } from '../../server/handler';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer(createApiHandler(new DemoProvider()));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const get = async (path: string) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};

describe('API (demo provider)', () => {
  it('falls back to demo mode without credentials', () => {
    expect(providerFromEnv({}).demo).toBe(true);
  });

  it('lists TBC raids', async () => {
    const { body } = await get('/api/meta');
    const meta = body as Meta;
    expect(meta.demo).toBe(true);
    const names = meta.raids.map((r) => r.name);
    expect(names).toEqual([
      'Karazhan',
      "Gruul's Lair",
      "Magtheridon's Lair",
      'Serpentshrine Cavern',
      'Tempest Keep',
      'Mount Hyjal',
      'Black Temple',
      "Zul'Aman",
      'Sunwell Plateau',
    ]);
  });

  it('returns a zone report with p99 benchmarks', async () => {
    const { status, body } = await get('/api/character?region=us&realm=dreamscythe&name=brannoc&raid=1011-black-temple');
    expect(status).toBe(200);
    const report = body as ZoneReport;
    expect(report.character.name).toBe('Brannoc');
    expect(report.raid.name).toBe('Black Temple');
    expect(report.rows).toHaveLength(9);
    for (const row of report.rows) {
      expect(row.benchmark!.p99).toBeGreaterThan(row.benchmark!.p50);
      expect(row.benchmark!.sampleSize).toBeGreaterThan(0);
    }
  });

  it('returns an ability comparison', async () => {
    const { status, body } = await get('/api/compare?region=us&realm=dreamscythe&name=brannoc&encounter=609&spec=Fury');
    expect(status).toBe(200);
    const c = body as Comparison;
    expect(c.abilities.length).toBeGreaterThan(3);
    expect(c.ref.perSecond).toBeGreaterThan(0);
  });

  it('validates input', async () => {
    expect((await get('/api/character?region=zz&realm=a&name=Bob')).status).toBe(400);
    expect((await get('/api/compare?region=us&realm=a&name=Bob&spec=Fury')).status).toBe(400);
    expect((await get('/api/nope')).status).toBe(404);
  });

  it('404s when there is no kill', async () => {
    const { status, body } = await get('/api/compare?region=us&realm=dreamscythe&name=brannoc&encounter=729&spec=Fury');
    expect(status).toBe(404);
    expect(body.error.code).toBe('not_found');
  });
});
