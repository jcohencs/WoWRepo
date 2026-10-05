import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Meta, Site } from '../shared/types.js';
import { MINUTE, TtlCache } from './cache.js';
import { validateRef } from './core/input.js';
import { DemoProvider } from './demo/provider.js';
import { ApiFailure } from './errors.js';
import type { Provider } from './provider.js';
import { WclClient } from './wcl/client.js';
import { cacheFile, REFRESH_HEADROOM, WclProvider } from './wcl/provider.js';

export function providerFromEnv(env: Record<string, string | undefined> = process.env, opts: { refresh?: boolean } = {}): Provider {
  const site: Site = env.WCL_SITE === 'classic' ? 'classic' : 'fresh';
  if (!env.WCL_CLIENT_ID || !env.WCL_CLIENT_SECRET) return new DemoProvider();
  const client = new WclClient({ clientId: env.WCL_CLIENT_ID, clientSecret: env.WCL_CLIENT_SECRET, site });
  const cache = new TtlCache({ file: cacheFile(site, env.CACHE_DIR), canRefresh: () => client.headroom() > REFRESH_HEADROOM });
  const provider = new WclProvider(client, site, cache);
  if (opts.refresh) setInterval(() => void provider.refreshTracked().catch(() => undefined), 10 * MINUTE).unref();
  return provider;
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

export function createApiHandler(provider: Provider = providerFromEnv(process.env, { refresh: true })): ApiHandler {
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
      if (err instanceof ApiFailure) return send(res, err.status, { error: { code: err.code, message: err.message } });
      console.error(err);
      return send(res, 502, { error: { code: 'upstream', message: 'Could not reach Warcraft Logs.' } });
    }
  };
}
