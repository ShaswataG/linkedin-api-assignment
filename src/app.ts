import express, { Express } from 'express';
import { Config } from './config';
import { ProfileFetchers } from './linkedin/profileService';
import { createProfileRouter } from './api/routes/profile.routes';
import { createHealthRouter } from './api/routes/health.routes';
import { errorHandler } from './api/middleware/errorHandler';
import { rateLimit } from './api/middleware/rateLimit';
import { NotFoundError } from './api/errors';

export function createApp(
  config: Config,
  fetchers: ProfileFetchers & { invalidate?(vanityName: string): void },
): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.use('/', createHealthRouter());
  app.use('/api', rateLimit(config.rateLimitPerMinute), createProfileRouter({ fetchers }));

  app.use((req, _res, next) => next(new NotFoundError(`No route for ${req.method} ${req.path}`)));
  app.use(errorHandler);

  return app;
}
