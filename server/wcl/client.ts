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

/**
 * A short human label for a query, for the request log ("character Alphac", "top 1% rankings ×9").
 */
export function describeQuery(query: string, variables: Record<string, unknown> = {}): string {
  const count = (re: RegExp) => (query.match(re) ?? []).length;
  const who = typeof variables.name === 'string' ? ` ${variables.name}` : '';
  if (/expansions/.test(query)) return 'raid list';
  if (/serverSlug: \$realm/.test(query) && /className: "/.test(query)) return `#1 of each class (${count(/characterRankings\(/g)} boss rankings)`;
  if (/serverSlug: \$realm/.test(query)) return `realm raiders (${count(/characterRankings\(/g)} pages)`;
  if (/c0: character\(/.test(query)) return `characters ×${count(/: character\(/g)}`;
  if (/zoneRankings/.test(query)) return `character${who}`;
  if (/encounterRankings/.test(query)) return `best kills${who}`;
  if (/characterRankings/.test(query)) return `rankings ×${count(/characterRankings\(/g)}`;
  if (/players: table/.test(query)) return `log ${variables.code ?? ''} (players)`;
  if (/table\(|graph\(/.test(query)) return `log ${variables.code ?? ''} (breakdown)`;
  if (/reportData/.test(query)) return `log ${variables.code ?? ''}`;
  return 'request';
}

/** Groups request labels by kind ("log (breakdown)", "best kills", …) for the points summary. */
export function spendKind(label: string): string {
  return label
    .replace(/^log \S+$/, 'log')
    .replace(/^log \S+ /, 'log ')
    .replace(/^(character|best kills) .+$/, '$1')
    .replace(/ ×\d+$/, '')
    .replace(/ \(\d+ [^)]*\)$/, '');
}

/** Request log on by default; WCL_LOG=off silences it (tests are quiet unless WCL_LOG=on). */
const logEnabled = () => (process.env.WCL_LOG ? process.env.WCL_LOG !== 'off' : !process.env.VITEST);

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

  /** The hour's points total in the latest reply. */
  private lastSeenPoints: number | null = null;

  /** Points this server spent since `takeSpending()` was last called, by kind of request. */
  private spent = new Map<string, number>();

  /** Returns and resets the points spent by kind of request, and the hour's total as Warcraft Logs reports it. */
  takeSpending(): { byKind: [string, number][]; total: number; hourUsed: number | null } {
    const byKind = [...this.spent.entries()].sort((a, b) => b[1] - a[1]);
    const total = byKind.reduce((n, [, v]) => n + v, 0);
    this.spent = new Map();
    return { byKind, total, hourUsed: this.rate ? Math.round(this.rate.pointsSpentThisHour) : null };
  }

  /** Whether the hour's total was looked up before the first request. */
  private primed = false;

  /** Requests run one at a time, so each one's cost is exactly the change in the hour's total. */
  private chain: Promise<unknown> = Promise.resolve();

  query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const run = this.chain.then(() => this.measured<T>(query, variables));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async measured<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const label = describeQuery(query, variables);
    const kind = spendKind(label);
    // Know the hour's total before the first request, so even that one has an exact cost. Asking
    // for the total alone costs nothing.
    if (this.lastSeenPoints == null && !this.primed) {
      this.primed = true;
      try {
        await this.send('{ __typename }', {});
        if (this.rate) this.lastSeenPoints = this.rate.pointsSpentThisHour;
      } catch {
        // Not worth failing the real request over; its cost just won't be shown.
      }
    }
    const before = this.lastSeenPoints;
    const started = Date.now();
    const log = (status: string) => {
      const r = this.rate;
      // Nothing else runs at the same time, so the change in the hour's total is this request's
      // cost. A lower total than before means a new hour began.
      const spent = r && before != null ? (r.pointsSpentThisHour >= before ? r.pointsSpentThisHour - before : r.pointsSpentThisHour) : null;
      if (r) this.lastSeenPoints = r.pointsSpentThisHour;
      if (spent != null) this.spent.set(kind, (this.spent.get(kind) ?? 0) + spent);
      const cost = spent != null ? ` +${Math.round(spent * 10) / 10} pts` : '';
      const budget = r && r.limitPerHour ? ` · ${Math.round(r.pointsSpentThisHour)}/${r.limitPerHour} used this hour` : '';
      if (!logEnabled()) return;
      console.log(`[wcl] ${status.padEnd(7)} ${label} · ${Date.now() - started}ms${cost}${budget}`);
    };
    try {
      const data = await this.send<T>(query, variables);
      log('ok');
      return data;
    } catch (err) {
      const why = err instanceof ApiFailure ? err.code : 'error';
      log(why === 'rate_limited' ? 'limited' : 'failed');
      if (why !== 'rate_limited' && logEnabled()) console.log(`[wcl]         ↳ ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  private async send<T>(query: string, variables: Record<string, unknown>): Promise<T> {
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
