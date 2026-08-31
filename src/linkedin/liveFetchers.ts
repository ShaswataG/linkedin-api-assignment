import { Config } from '../config';
import { TtlCache } from './cache';
import { UpstreamLimiter } from './upstreamLimiter';
import {
  fetchDetailsPage,
  fetchDetailsPagination,
  fetchProfileCard,
  fetchProfileDocument,
} from './client';
import { CachedFetchers, withCache } from './cachedFetchers';

export function createLiveFetchers(config: Config): CachedFetchers {
  return withCache(
    {
      fetchCard: (vanityName, cardId) => fetchProfileCard(vanityName, cardId, config.session),
      fetchDocument: (vanityName) => fetchProfileDocument(vanityName, config.session),
      fetchDetails: (vanityName, request) =>
        request.kind === 'html'
          ? fetchDetailsPage(vanityName, request.path, config.session)
          : fetchDetailsPagination(
              {
                vanityName,
                profileId: request.profileId,
                pagerId: request.pagerId,
                screenId: request.screenId,
                sectionRef: request.sectionRef,
              },
              config.session,
            ),
    },
    new TtlCache<string>(config.cacheTtlMs),
    new UpstreamLimiter(config.upstreamMinIntervalMs),
  );
}
