import { readFileSync } from 'fs';
import { resolve } from 'path';


export function readHar(harPath: string): any {
  const text = readFileSync(resolve(harPath), 'utf-8');
  try {
    return JSON.parse(text);
  } catch (err) {
    const truncated = /Unterminated|Unexpected end of (JSON|input)/i.test(String(err));
    throw new Error(
      truncated
        ? `${harPath} is truncated or incomplete (${text.length} bytes). Re-export it from ` +
          `DevTools with "Save all as HAR with content".`
        : `${harPath} is not valid JSON: ${String(err)}`,
    );
  }
}

export function loadCardFromHar(harPath: string, componentIdSuffix: string): string {
  const har = readHar(harPath);

  for (const entry of har?.log?.entries ?? []) {
    const request = entry?.request;
    if (request?.method !== 'POST') continue;

    // Match on the componentId query param rather than a substring of the
    // whole URL: `sduiid` carries the same value, and the raw URL also
    // contains a parentSpanId that can coincidentally collide.
    const componentId = (request.queryString ?? []).find(
      (q: { name: string }) => q.name === 'componentId',
    )?.value;
    if (typeof componentId !== 'string' || !componentId.endsWith(componentIdSuffix)) continue;

    const response = entry?.response;
    if (response?.status !== 200) continue;

    const content = response?.content;
    const text = content?.text;
    if (typeof text !== 'string' || text.length === 0) {
      // A HAR saved WITHOUT "with content" has entries but no bodies — a
      // real and easy-to-hit capture mistake, so name it explicitly rather
      // than reporting the card as simply missing.
      throw new Error(
        `HAR entry for ${componentIdSuffix} has no response body. Re-capture ` +
          `using "Save all as HAR with content".`,
      );
    }

    return content.encoding === 'base64'
      ? Buffer.from(text, 'base64').toString('utf-8')
      : text;
  }

  const hasDocument = (har?.log?.entries ?? []).some(
    (e: { request?: { url?: string; method?: string } }) =>
      e.request?.method === 'GET' &&
      /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?(\?|$)/.test(e.request?.url ?? ''),
  );
  const componentCount = (har?.log?.entries ?? []).filter(
    (e: { request?: { url?: string } }) =>
      (e.request?.url ?? '').includes('rsc-action/actions/component'),
  ).length;

  if (hasDocument && componentCount === 0) {
    throw new Error(
      `${harPath} is a Doc-filtered capture: it holds the profile page document but no ` +
        `component cards, so "${componentIdSuffix}" cannot be in it. Use a "_full_profile" ` +
        `HAR for section parsers, or explore-topcard.ts for this one.`,
    );
  }

  throw new Error(
    `No 200 POST response for componentId ending "${componentIdSuffix}" in ${harPath}` +
      (componentCount > 0 ? ` (${componentCount} other component responses present)` : ''),
  );
}

export const PART1_WITHOUT_EXP = 'profileCardsBelowActivityPart1WithoutExp';

export function loadDocumentFromHar(harPath: string): string {
  const har = readHar(harPath);

  for (const entry of har?.log?.entries ?? []) {
    const request = entry?.request;
    if (request?.method !== 'GET') continue;
    if (!/^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?(\?|$)/.test(request.url ?? '')) continue;

    const content = entry?.response?.content;
    const text = content?.text;
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error(
        `Profile document in ${harPath} has no response body. Re-capture using ` +
          `"Save all as HAR with content".`,
      );
    }
    return content.encoding === 'base64'
      ? Buffer.from(text, 'base64').toString('utf-8')
      : text;
  }

  throw new Error(
    `No profile document (GET /in/{vanity}/) in ${harPath}. Capture with the "Doc" filter.`,
  );
}
