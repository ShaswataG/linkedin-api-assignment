import { Config } from '../config';
import { TtlCache } from './cache';
import { UpstreamLimiter } from './upstreamLimiter';
import { fetchDetailsPage, fetchProfileCard, fetchProfileDocument } from './client';
import { CachedFetchers, withCache } from './cachedFetchers';

export function createLiveFetchers(config: Config): CachedFetchers {
  return withCache(
    {
      fetchCard: (vanityName, cardId) => fetchProfileCard(vanityName, cardId, config.session),
      fetchDocument: (vanityName) => fetchProfileDocument(vanityName, config.session),
      fetchDetails: (vanityName, detailsPath) =>
        fetchDetailsPage(vanityName, detailsPath, config.session),
    },
    new TtlCache<string>(config.cacheTtlMs),
    new UpstreamLimiter(config.upstreamMinIntervalMs),
  );
}
