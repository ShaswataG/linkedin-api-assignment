import { REQUEST_BODY_TEMPLATE, TEMPLATE_VANITY_NAME } from './requestBodyTemplate';

export function buildComponentRequestBody(vanityName: string): string {
  return REQUEST_BODY_TEMPLATE
    .split(`"vanityName":"${TEMPLATE_VANITY_NAME}"`)
    .join(`"vanityName":"${vanityName}"`);
}

export function generateSpanId(): string {
  return Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64').slice(0, 12);
}

export interface LinkedInSession {
  cookie: string; // full Cookie header value, including li_at and JSESSIONID
  csrfToken: string; // must match the quoted value inside JSESSIONID
}

export async function fetchProfileCard(
  vanityName: string,
  componentId: string,
  session: LinkedInSession,
): Promise<string> {
  const url = `https://www.linkedin.com/flagship-web/rsc-action/actions/component?componentId=${componentId}&sduiid=${componentId}&parentSpanId=${encodeURIComponent(generateSpanId())}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'csrf-token': session.csrfToken,
      origin: 'https://www.linkedin.com',
      referer: `https://www.linkedin.com/in/${vanityName}/`,
      cookie: session.cookie,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    },
    body: buildComponentRequestBody(vanityName),
  });

  if (!res.ok) {
    throw new Error(`LinkedIn returned ${res.status} for ${componentId} (profile: ${vanityName})`);
  }

  return res.text();
}