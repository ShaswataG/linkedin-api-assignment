import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../openapi';

export function createDocsRouter(): Router {
  const router = Router();

  router.get('/docs/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument as unknown as swaggerUi.JsonObject, {
      customSiteTitle: 'LinkedIn Profile API — reference',
      swaggerOptions: {
        // Collapsed by default: the descriptions are long, and a reader
        // scanning for an endpoint should see the list first.
        docExpansion: 'list',
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 3,
        displayRequestDuration: true,
        tryItOutEnabled: true,
        persistAuthorization: false,
      },
    }),
  );

  return router;
}
