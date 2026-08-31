import express, { Express } from 'express';
import { Config } from './config';
import { ProfileFetchers } from './linkedin/profileService';
import { createProfileRouter } from './api/routes/profile.routes';
import { createHealthRouter } from './api/routes/health.routes';
import { createDocsRouter } from './api/routes/docs.routes';
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

  app.use('/', createDocsRouter());
  app.use('/', createHealthRouter());
  app.use('/api', rateLimit(config.rateLimitPerMinute), createProfileRouter({ fetchers }));


  app.use((req, res, next) => {
    if (req.path === '/docs' || req.path.startsWith('/docs/')) {
      next(new NotFoundError(`No route for ${req.method} ${req.path}`));
      return;
    }
    res.redirect(302, '/docs');
  });

  app.use(errorHandler);

  return app;
}
