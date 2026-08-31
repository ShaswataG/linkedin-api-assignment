import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../openapi';

const FORCE_LIGHT_THEME = `
(function forceLightTheme() {
  var root = document.documentElement;
  function stripDarkMode() {
    if (!root.classList.contains('dark-mode')) return false;
    root.classList.remove('dark-mode');
    return true;
  }

  // The preset may already have mounted by the time this runs.
  if (stripDarkMode()) return;

  // Otherwise wait for it to add the class, remove it once, then stop so a
  // deliberate toggle is not fought.
  var observer = new MutationObserver(function () {
    if (stripDarkMode()) observer.disconnect();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  setTimeout(function () { observer.disconnect(); }, 5000);
})();
`;

const LIGHT_COLOR_SCHEME_CSS = `
  html { color-scheme: light; }
  body { background: #fafafa; }
`;

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
      customCss: LIGHT_COLOR_SCHEME_CSS,
      // `customJsStr` inlines a <script> into the page and IS supported at
      // runtime (swagger-ui-express 5.x renders it via toInlineScriptTag), but
      // @types/swagger-ui-express does not declare it. Cast rather than use
      // `customJs`, which only takes a URL and would mean serving a file for
      // eight lines of script.
      ...({ customJsStr: FORCE_LIGHT_THEME } as Record<string, unknown>),
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
