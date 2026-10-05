import type { Site } from '../../shared/types.js';
import { ApiFailure } from '../errors.js';

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';

/** Points Warcraft Logs allows per hour for this API key, as last reported. */
export interface RateLimit {
  limitPerHour: number;
  pointsSpentThisHour: number;
  /** Epoch ms when the hourly window resets. */
  resetsAt: number;
}

/** How long to wait after a refusal when Warcraft Logs hasn't told us when the hour resets. */
const RETRY_AFTER_429_MS = 5 * 60_000;

const RATE_FIELD = 'rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }';

/** Adds the rate-limit field to the root selection so every response reports the budget. */
export function withRateLimit(query: string): string {
  const i = query.indexOf('{');
  return i < 0 ? query : `${query.slice(0, i + 1)} ${RATE_FIELD} ${query.slice(i + 1)}`;
}

export interface WclClientOptions {
  clientId: string;
  clientSecret: string;
  site: Site;
  fetch?: typeof fetch;
}

/** Thin Warcraft Logs v2 GraphQL client using the client-credentials flow. */
export class WclClient {
  private token: { value: string; expires: number } | null = null;
  private rate: RateLimit | null = null;
  /** Set when Warcraft Logs refuses a request (HTTP 429); no requests are sent before this time. */
  private blockedUntil = 0;
  /** What Warcraft Logs said when it last refused a request, for diagnostics. */
  lastRefusal: string | null = null;
  private readonly fetch: typeof fetch;
  readonly endpoint: string;

  constructor(private readonly opts: WclClientOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch;
    this.endpoint = `https://${opts.site}.warcraftlogs.com/api/v2/client`;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString('base64');
    const res = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      throw new ApiFailure('config', `Warcraft Logs rejected the API credentials (HTTP ${res.status}).`);
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  /** Last known hourly budget, or null before the first request. */
  rateLimit(): RateLimit | null {
    if (this.rate && this.rate.resetsAt <= Date.now()) return { ...this.rate, pointsSpentThisHour: 0 };
    return this.rate;
  }

  /** Fraction of this hour's allowance still unspent (1 when unknown). */
  headroom(): number {
    const r = this.rateLimit();
    if (!r || !r.limitPerHour) return 1;
    return Math.max(0, 1 - r.pointsSpentThisHour / r.limitPerHour);
  }

  /** Points kept in reserve so a single large query can't push us over the limit. */
  private reserve(): number {
    return Math.max(10, Math.round((this.rate?.limitPerHour ?? 0) * 0.03));
  }

  private limitedError(): ApiFailure {
    const until = Math.max(this.blockedUntil, this.rate?.resetsAt ?? 0, Date.now() + 60_000);
    const mins = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
    return new ApiFailure(
      'rate_limited',
      `This hour's Warcraft Logs allowance is used up. It resets in about ${mins} minute${mins === 1 ? '' : 's'}; saved results still work until then.`,
    );
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (Date.now() < this.blockedUntil) throw this.limitedError();
    const rate = this.rateLimit();
    if (rate && rate.limitPerHour > 0 && rate.pointsSpentThisHour >= rate.limitPerHour - this.reserve()) throw this.limitedError();

    const res = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: withRateLimit(query), variables }),
    });
    if (res.status === 429) {
      this.lastRefusal = `HTTP 429${res.headers.get('retry-after') ? `, retry-after ${res.headers.get('retry-after')}s` : ''}: ${(await res.text().catch(() => '')).slice(0, 300).trim() || '(no message)'}`;
      // Wait for the known reset; if we don't know it yet, try again in a few minutes.
      const knownReset = this.rate && this.rate.resetsAt > Date.now() ? this.rate.resetsAt : 0;
      this.blockedUntil = knownReset || Date.now() + RETRY_AFTER_429_MS;
      if (this.rate) this.rate = { ...this.rate, pointsSpentThisHour: this.rate.limitPerHour };
      throw this.limitedError();
    }
    if (res.status === 401) this.token = null;
    if (!res.ok) throw new ApiFailure('upstream', `Warcraft Logs returned HTTP ${res.status}.`);
    const body = (await res.json()) as {
      data?: T & { rateLimitData?: { limitPerHour: number; pointsSpentThisHour: number; pointsResetIn: number } };
      errors?: { message: string }[];
    };
    const r = body.data?.rateLimitData;
    if (r) this.rate = { limitPerHour: r.limitPerHour, pointsSpentThisHour: r.pointsSpentThisHour, resetsAt: Date.now() + r.pointsResetIn * 1000 };
    if (body.errors?.length) {
      const message = body.errors.map((e) => e.message).join('; ');
      if (/rate limit|too many/i.test(message)) throw this.limitedError();
      throw new ApiFailure('upstream', message);
    }
    if (!body.data) throw new ApiFailure('upstream', 'Warcraft Logs returned no data.');
    return body.data;
  }
}
