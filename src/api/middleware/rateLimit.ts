import { NextFunction, Request, Response } from 'express';
import { RateLimitedError } from '../errors';

export function rateLimit(requestsPerMinute: number) {
  const windowMs = 60_000;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function rateLimitMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = req.ip ?? 'unknown';

    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);

    const entry = hits.get(key) ?? { count: 0, resetAt: now + windowMs };
    entry.count += 1;
    hits.set(key, entry);

    if (entry.count > requestsPerMinute) {
      next(
        new RateLimitedError(
          `Rate limit of ${requestsPerMinute} requests/minute exceeded.`,
          Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
        ),
      );
      return;
    }
    next();
  };
}
