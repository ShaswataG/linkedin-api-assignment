import { TtlCache } from './cache';
import { UpstreamLimiter } from './upstreamLimiter';
import { FetchResult, ProfileFetchers } from './profileService';

export interface RawFetchers {
  fetchCard(vanityName: string, cardId: string): Promise<string>;
  fetchDocument(vanityName: string): Promise<string>;
  fetchDetails(vanityName: string, detailsPath: string): Promise<string>;
}

export interface CachedFetchers extends ProfileFetchers {
  invalidate(vanityName: string): void;
}

export function withCache(
  raw: RawFetchers,
  cache: TtlCache<string>,
  limiter: UpstreamLimiter,
): CachedFetchers {
  async function cached(key: string, fetcher: () => Promise<string>): Promise<FetchResult> {
    const hit = cache.get(key);
    if (hit !== undefined) return { text: hit, cached: true };

    const text = await limiter.run(fetcher);
    cache.set(key, text);
    return { text, cached: false };
  }

  return {
    fetchCard: (vanityName, cardId) =>
      cached(`${vanityName}:${cardId}`, () => raw.fetchCard(vanityName, cardId)),
    fetchDocument: (vanityName) =>
      cached(`${vanityName}:document`, () => raw.fetchDocument(vanityName)),
    fetchDetails: (vanityName, detailsPath) =>
      cached(`${vanityName}:details:${detailsPath}`, () =>
        raw.fetchDetails(vanityName, detailsPath),
      ),
    invalidate: (vanityName) => {
      cache.deleteByPrefix(`${vanityName}:`);
    },
  };
}
