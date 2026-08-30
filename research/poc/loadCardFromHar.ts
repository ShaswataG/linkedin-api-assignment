import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Loads a captured component-card response out of a HAR file, so exploration
 * and regression scripts can run against real LinkedIn data WITHOUT a live
 * session cookie.
 *
 * Why this exists rather than calling `fetchProfileCard`: a regression test
 * that hits the network is neither deterministic (LinkedIn's payload changes
 * between renders — componentkeys are per-render UUIDs) nor safe to re-run
 * freely (every run spends real quota against the backing account, and the
 * ban risk is treated as a first-class constraint on this project). It also
 * keeps session credentials out of source entirely.
 *
 * HAR bodies for these endpoints come back base64-encoded because LinkedIn
 * serves them as `application/octet-stream` rather than a text mime type —
 * DevTools only stores `content.text` verbatim for types it considers text.
 */
export function loadCardFromHar(harPath: string, componentIdSuffix: string): string {
  const har = JSON.parse(readFileSync(resolve(harPath), 'utf-8'));

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

  throw new Error(`No 200 POST response for componentId ending "${componentIdSuffix}" in ${harPath}`);
}

/** The card that bundles Education, Certifications, Volunteer and Projects. */
export const PART1_WITHOUT_EXP = 'profileCardsBelowActivityPart1WithoutExp';
