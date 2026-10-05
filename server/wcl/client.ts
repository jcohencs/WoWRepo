import type { Site } from '../../shared/types.js';
import { ApiFailure } from '../errors.js';

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';

export interface WclClientOptions {
  clientId: string;
  clientSecret: string;
  site: Site;
  fetch?: typeof fetch;
}

/** Thin Warcraft Logs v2 GraphQL client using the client-credentials flow. */
export class WclClient {
  private token: { value: string; expires: number } | null = null;
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

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) throw new ApiFailure('rate_limited', 'Warcraft Logs rate limit reached. Try again in a minute.');
    if (res.status === 401) this.token = null;
    if (!res.ok) throw new ApiFailure('upstream', `Warcraft Logs returned HTTP ${res.status}.`);
    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) throw new ApiFailure('upstream', body.errors.map((e) => e.message).join('; '));
    if (!body.data) throw new ApiFailure('upstream', 'Warcraft Logs returned no data.');
    return body.data;
  }
}
