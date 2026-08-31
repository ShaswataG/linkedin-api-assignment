export interface Config {
  port: number;
  cacheTtlMs: number;
  rateLimitPerMinute: number;
  upstreamMinIntervalMs: number;
  session: { cookie: string; csrfToken: string };
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative number, got "${raw}"`);
  }
  return parsed;
}

function validateSession(cookie: string, csrfToken: string): void {
  if (!cookie || !csrfToken) {
    throw new Error(
      'LINKEDIN_SESSION_COOKIE and LINKEDIN_CSRF_TOKEN must be set. ' +
        'Copy .env.example to .env and fill them in — never hardcode them.',
    );
  }

  if (!/(^|;\s*)li_at=/.test(cookie)) {
    throw new Error('LINKEDIN_SESSION_COOKIE must include the li_at cookie (li_at=AQEDA...).');
  }

  const jsessionMatch = /(^|;\s*)JSESSIONID="?([^;"]+)"?/.exec(cookie);
  if (!jsessionMatch) {
    throw new Error(
      'LINKEDIN_SESSION_COOKIE must include JSESSIONID, e.g. JSESSIONID="ajax:1234567890".',
    );
  }

  if (/^"|"$/.test(csrfToken)) {
    throw new Error(
      'LINKEDIN_CSRF_TOKEN must not be quoted. Use ajax:1234567890, not "ajax:1234567890".',
    );
  }

  if (jsessionMatch[2] !== csrfToken) {
    throw new Error(
      'LINKEDIN_CSRF_TOKEN must equal the JSESSIONID value in LINKEDIN_SESSION_COOKIE ' +
        `(cookie has "${jsessionMatch[2]}", token is "${csrfToken}"). ` +
        'They come from the same session; a mismatch is rejected with 403.',
    );
  }
}

export function loadConfig(): Config {
  const cookie = (process.env.LINKEDIN_SESSION_COOKIE ?? '').trim();
  const csrfToken = (process.env.LINKEDIN_CSRF_TOKEN ?? '').trim();

  validateSession(cookie, csrfToken);

  return {
    port: num('PORT', 3000),
    cacheTtlMs: num('CACHE_TTL_HOURS', 48) * 60 * 60 * 1000,
    rateLimitPerMinute: num('RATE_LIMIT_PER_MINUTE', 5),
    upstreamMinIntervalMs: num('UPSTREAM_MIN_INTERVAL_MS', 1200),
    session: { cookie, csrfToken },
  };
}
