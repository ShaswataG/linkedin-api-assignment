import { NextFunction, Request, Response } from 'express';
import { ApiError, RateLimitedError } from '../errors';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ApiError) {
    if (err instanceof RateLimitedError) res.setHeader('Retry-After', err.retryAfterSeconds);
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  console.error('[unhandled]', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
}
