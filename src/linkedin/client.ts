import { REQUEST_BODY_TEMPLATE, TEMPLATE_VANITY_NAME } from './requestBodyTemplate';

function retargetStrings(node: unknown, from: string, to: string): unknown {
  if (typeof node === 'string') return node.split(from).join(to);
  if (Array.isArray(node)) return node.map((item) => retargetStrings(item, from, to));
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = retargetStrings(value, from, to);
    }
    return out;
  }
  return node;
}

export function buildComponentRequestBody(vanityName: string): string {
  try {
    const template = JSON.parse(REQUEST_BODY_TEMPLATE) as {
      clientArguments?: { payload?: Record<string, unknown> };
    };
    const templatePayload = template?.clientArguments?.payload;

    const sectionArgs = templatePayload?.replaceableSectionArgs as
      | { vanityName?: unknown }
      | undefined;
    const capturedVanity =
      (typeof sectionArgs?.vanityName === 'string' && sectionArgs.vanityName) ||
      (TEMPLATE_VANITY_NAME || '');

    const retargeted = capturedVanity
      ? (retargetStrings(template, capturedVanity, vanityName) as typeof template)
      : template;

    const payload = retargeted?.clientArguments?.payload;
    if (payload) payload.vanityName = vanityName;

    return JSON.stringify(retargeted);
  } catch {
    return REQUEST_BODY_TEMPLATE.split(`"vanityName":"${TEMPLATE_VANITY_NAME}"`).join(
      `"vanityName":"${vanityName}"`,
    );
  }
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

export async function fetchProfileDocument(
  vanityName: string,
  session: LinkedInSession,
): Promise<string> {
  const res = await fetch(`https://www.linkedin.com/in/${encodeURIComponent(vanityName)}/`, {
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      cookie: session.cookie,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`LinkedIn returned ${res.status} for profile document (${vanityName})`);
  }

  return res.text();
}

export async function fetchDetailsPage(
  vanityName: string,
  detailsPath: string,
  session: LinkedInSession,
): Promise<string> {
  const path = detailsPath.replace(/^\/+|\/+$/g, '');
  const url = `https://www.linkedin.com/in/${encodeURIComponent(vanityName)}/${path}/`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      cookie: session.cookie,
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`LinkedIn returned ${res.status} for ${url}`);
  }
  return res.text();
}

export const DETAILS_PAGE_SIZE = 10;

/** Client version LinkedIn's web app reports; sent back in its tracking headers. */
const LINKEDIN_CLIENT_VERSION = '0.2.7003';

/**
 * A page-instance tracking id in LinkedIn's format: base64 of 16 random bytes
 * (e.g. "15N3zXUpT0qZsVFbPY20bQ=="). Purely an observability token — a fresh
 * one per request is what the browser does too.
 */
function generateTrackingId(): string {
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes.toString('base64');
}

/** Everything the details pagination endpoint needs, derived from the card. */
export interface DetailsPageRequest {
  vanityName: string;
  profileId: string;
  pagerId: string;
  screenId: string;
  /**
   * Pager-specific payload fields. Education sends
   * `detailSectionReplaceableComponentRef`; Skills sends `filter`. Passing the
   * wrong one leaves paging stuck on the first page.
   */
  payloadExtras?: Record<string, unknown>;
  start?: number;
  count?: number;
  refererPath?: string;
  /** `x-li-anchor-page-key` identifying the screen being paged. */
  anchorPageKey?: string;
}

/**
 * Fetches a section's FULL list from the details pagination endpoint.
 *
 * This is the good path: the `/details/{section}/` HTML page does not contain
 * the list for every section — it arrives from this endpoint in the same
 * Flight format as the profile cards. Same decoder, same field classifiers,
 * and real `start`/`count` paging instead of scraping a rendered page.
 */
export async function fetchDetailsPagination(
  request: DetailsPageRequest,
  session: LinkedInSession,
): Promise<string> {
  const url =
    `https://www.linkedin.com/flagship-web/rsc-action/actions/pagination` +
    `?sduiid=${encodeURIComponent(request.pagerId)}` +
    `&parentSpanId=${encodeURIComponent(generateSpanId())}`;

  const payload = {
    vanityName: request.vanityName,
    profileId: request.profileId,
    start: request.start ?? 0,
    count: request.count ?? DETAILS_PAGE_SIZE,
    ...(request.payloadExtras ?? {}),
  };
  const requestedArguments = {
    $type: 'proto.sdui.actions.requests.RequestedArguments',
    requestedStateKeys: [],
    payload,
    requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
  };

  const body = {
    pagerId: request.pagerId,
    clientArguments: {
      ...requestedArguments,
      states: [],
      screenId: request.screenId,
      knownTemplateIds: [],
    },
    paginationRequest: {
      $type: 'proto.sdui.actions.requests.PaginationRequest',
      pagerId: request.pagerId,
      trigger: {
        $case: 'itemDistanceTrigger',
        itemDistanceTrigger: {
          $type: 'proto.sdui.actions.requests.ItemDistanceTrigger',
          preloadDistance: 3,
          preloadLength: 250,
        },
      },
      retryCount: 2,
      requestedArguments,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/json',
      'csrf-token': session.csrfToken,
      origin: 'https://www.linkedin.com',
      referer: `https://www.linkedin.com/in/${request.vanityName}/${request.refererPath ?? ''}`,
      cookie: session.cookie,
      // LinkedIn's own client sends these on every pagination request. They
      // are omitted from the component POSTs, which work without them — but a
      // pager that received none of them returned the FIRST page for every
      // offset, so the screen context they carry appears to matter here.
      // `x-li-rsc-stream` in particular selects the incremental response.
      'x-li-rsc-stream': 'true',
      ...(request.anchorPageKey
        ? {
            'x-li-anchor-page-key': request.anchorPageKey,
            'x-li-page-instance': `urn:li:page:${request.anchorPageKey};${generateTrackingId()}`,
          }
        : {}),
      'x-li-application-version': LINKEDIN_CLIENT_VERSION,
      'x-li-track': JSON.stringify({
        clientVersion: LINKEDIN_CLIENT_VERSION,
        mpVersion: LINKEDIN_CLIENT_VERSION,
        osName: 'web',
        timezoneOffset: 5.5,
        timezone: 'Asia/Calcutta',
        deviceFormFactor: 'DESKTOP',
        mpName: 'voyager-web',
      }),
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`LinkedIn returned ${res.status} for details pager ${request.pagerId}`);
  }
  return res.text();
}
