export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends ApiError {
  constructor(message: string) {
    super(400, 'BAD_REQUEST', message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
  }
}

export class RateLimitedError extends ApiError {
  constructor(message: string, readonly retryAfterSeconds: number) {
    super(429, 'RATE_LIMITED', message);
  }
}

export class UpstreamError extends ApiError {
  constructor(message: string) {
    super(502, 'UPSTREAM_FAILURE', message);
  }
}

export class UpstreamTimeoutError extends ApiError {
  constructor(message: string) {
    super(504, 'UPSTREAM_TIMEOUT', message);
  }
}
