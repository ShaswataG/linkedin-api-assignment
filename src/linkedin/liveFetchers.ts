import { Config } from '../config';
import { TtlCache } from './cache';
import { UpstreamLimiter } from './upstreamLimiter';
import {
  DetailsPageRequest,
  fetchDetailsPage,
  fetchDetailsPagination,
  fetchProfileCard,
  fetchProfileDocument,
} from './client';
import { CachedFetchers, withCache } from './cachedFetchers';
import { DetailsRequest } from './profileService';

/**
 * Maps the orchestrator's DetailsRequest onto the HTTP client's
 * DetailsPageRequest.
 *
 * Extracted and exported ONLY so it can be tested. It is a pure field-for-field
 * mapping, which is exactly the kind of code that looks too trivial to test —
 * and it silently dropped `start` and `count`, so every page of every paged
 * section was fetched as page 0. The offline suites could not see it because
 * the HAR fetchers implement `fetchDetails` themselves and never run this
 * mapping.
 */
export function toDetailsPageRequest(
  vanityName: string,
  request: Extract<DetailsRequest, { kind: 'pagination' }>,
): DetailsPageRequest {
  return {
    vanityName,
    profileId: request.profileId,
    pagerId: request.pagerId,
    screenId: request.screenId,
    payloadExtras: request.payloadExtras,
    anchorPageKey: request.anchorPageKey,
    refererPath: request.refererPath,
    start: request.start,
    count: request.count,
  };
}

export function createLiveFetchers(config: Config): CachedFetchers {
  return withCache(
    {
      fetchCard: (vanityName, cardId) => fetchProfileCard(vanityName, cardId, config.session),
      fetchDocument: (vanityName) => fetchProfileDocument(vanityName, config.session),
      fetchDetails: (vanityName, request) =>
        request.kind === 'html'
          ? fetchDetailsPage(vanityName, request.path, config.session)
          : fetchDetailsPagination(toDetailsPageRequest(vanityName, request), config.session),
    },
    new TtlCache<string>(config.cacheTtlMs),
    new UpstreamLimiter(config.upstreamMinIntervalMs),
  );
}
