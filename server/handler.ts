import type { IncomingMessage, ServerResponse } from 'node:http';
import { REALMS, type Meta, type Site } from '../shared/types.js';
import { MINUTE, TtlCache } from './cache.js';
import { validateRef } from './core/input.js';
import { DemoProvider } from './demo/provider.js';
import { ApiFailure, PendingPull } from './errors.js';
import type { Provider } from './provider.js';
import { WclClient } from './wcl/client.js';
import { cacheFile, WclProvider } from './wcl/provider.js';
import { Puller, SnapshotProvider } from './snapshot.js';

/** The live Warcraft Logs provider: it calls the API. Used by the scheduled puller and `npm run sync`. */
export function liveProviderFromEnv(env: Record<string, string | undefined> = process.env): { live: WclProvider; cache: TtlCache } | null {
  if (!env.WCL_CLIENT_ID || !env.WCL_CLIENT_SECRET) return null;
  const site: Site = env.WCL_SITE === 'classic' ? 'classic' : 'fresh';
  const client = new WclClient({ clientId: env.WCL_CLIENT_ID, clientSecret: env.WCL_CLIENT_SECRET, site });
  // serveStale off: the puller always saves current data.
  const cache = new TtlCache({ file: cacheFile(site, env.CACHE_DIR), serveStale: false });
  return { live: new WclProvider(client, site, cache), cache };
}

/**
 * What visitors talk to. With a key configured, pages come only from saved pulls and a timer
 * pulls from Warcraft Logs every PULL_INTERVAL_MINUTES (default 10). Without a key: demo data.
 */
export function providerFromEnv(env: Record<string, string | undefined> = process.env, opts: { schedule?: boolean } = {}): Provider {
  const setup = liveProviderFromEnv(env);
  if (!setup) return new DemoProvider();
  const minutes = Number(env.PULL_INTERVAL_MINUTES) || 10;
  const puller = new Puller(setup.live, setup.cache, minutes * MINUTE, Boolean(opts.schedule));
  if (opts.schedule) puller.start();
  return new SnapshotProvider(setup.live, setup.cache, puller);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function ref(params: URLSearchParams) {
  const parsed = validateRef({ region: params.get('region') ?? '', realm: params.get('realm') ?? '', name: params.get('name') ?? '' });
  if (typeof parsed === 'string') throw new ApiFailure('bad_request', parsed);
  return parsed;
}

function intParam(params: URLSearchParams, key: string, required: boolean): number | undefined {
  const raw = params.get(key);
  if (raw == null || raw === '') {
    if (required) throw new ApiFailure('bad_request', `Missing "${key}".`);
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ApiFailure('bad_request', `"${key}" must be a positive integer.`);
  return n;
}

export type ApiHandler = (req: IncomingMessage, res: ServerResponse, next?: () => void) => Promise<void>;

export function createApiHandler(provider: Provider = providerFromEnv(process.env, { schedule: true })): ApiHandler {
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return next ? next() : send(res, 404, { error: { code: 'not_found', message: 'Not found' } });
    if (req.method !== 'GET') return send(res, 405, { error: { code: 'bad_request', message: 'GET only' } });
    const p = url.searchParams;
    try {
      switch (url.pathname) {
        case '/api/meta': {
          const meta: Meta = { site: provider.site, demo: provider.demo, raids: await provider.raids() };
          return send(res, 200, meta);
        }
        case '/api/characters': {
          const realm = p.get('realm') ?? '';
          if (!REALMS.some((r) => r.slug === realm)) throw new ApiFailure('bad_request', 'Unknown realm.');
          return send(res, 200, await provider.characterNames(realm));
        }
        case '/api/status':
          return send(res, 200, provider.status());
        case '/api/character':
          return send(res, 200, await provider.zoneReport(ref(p), p.get('raid') || undefined));
        case '/api/compare': {
          const spec = p.get('spec') ?? '';
          if (!spec) throw new ApiFailure('bad_request', 'Missing "spec".');
          return send(res, 200, await provider.compare(ref(p), intParam(p, 'encounter', true)!, spec));
        }
        default:
          return send(res, 404, { error: { code: 'not_found', message: 'Not found' } });
      }
    } catch (err) {
      if (err instanceof PendingPull) {
        return send(res, 202, { pending: { position: err.position, nextUpdateInSec: err.nextUpdateInSec } });
      }
      if (err instanceof ApiFailure) return send(res, err.status, { error: { code: err.code, message: err.message } });
      console.error(err);
      return send(res, 502, { error: { code: 'upstream', message: 'Could not reach Warcraft Logs.' } });
    }
  };
}
