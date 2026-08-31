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

export interface DetailsPageRequest {
  vanityName: string;
  profileId: string;
  pagerId: string;
  screenId: string;
  sectionRef: string;
  start?: number;
  count?: number;
  refererPath?: string;
}

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
    detailSectionReplaceableComponentRef: request.sectionRef,
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
      'content-type': 'application/json',
      'csrf-token': session.csrfToken,
      origin: 'https://www.linkedin.com',
      referer: `https://www.linkedin.com/in/${request.vanityName}/${request.refererPath ?? ''}`,
      cookie: session.cookie,
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
