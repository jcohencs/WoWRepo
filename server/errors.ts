import type { ApiError } from '../shared/types.js';

export type ErrorCode = ApiError['error']['code'];

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  rate_limited: 429,
  upstream: 502,
  config: 500,
};

export class ApiFailure extends Error {
  readonly status: number;
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.status = STATUS[code];
  }
}
