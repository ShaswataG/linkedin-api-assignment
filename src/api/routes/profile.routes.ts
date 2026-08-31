import { Router } from 'express';
import { buildProfile, ProfileFetchers } from '../../linkedin/profileService';
import { ProfileData } from '../../types/profile';
import { SectionKey, isSectionKey, SECTION_KEYS } from '../../types/sections';
import { BadRequestError, NotFoundError, UpstreamError } from '../errors';
import { parseBooleanFlag, parseExpand, parseVanityName } from '../middleware/validateProfileQuery';

export interface ProfileRouterDeps {
  fetchers: ProfileFetchers & { invalidate?(vanityName: string): void };
}

function toApiError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (/\b404\b/.test(message)) {
    throw new NotFoundError('Profile not found or not publicly accessible.');
  }
  throw new UpstreamError(`Failed to retrieve profile data. ${message}`);
}

export function createProfileRouter({ fetchers }: ProfileRouterDeps): Router {
  const router = Router();

  router.get('/profile', async (req, res, next) => {
    try {
      const vanityName = parseVanityName(req.query.url);
      const expand = parseExpand(req.query.expand);

      if (parseBooleanFlag(req.query.forceRefresh, 'forceRefresh')) {
        fetchers.invalidate?.(vanityName);
      }

      const profile = await buildProfile(
        vanityName,
        `https://www.linkedin.com/in/${vanityName}`,
        fetchers,
        { expand },
      ).catch(toApiError);

      res.json(profile);
    } catch (err) {
      next(err);
    }
  });

  router.get('/profile/:vanityName/sections/:section', async (req, res, next) => {
    try {
      const { vanityName, section } = req.params;
      if (!isSectionKey(section)) {
        throw new BadRequestError(
          `Unknown section "${section}". Valid: ${SECTION_KEYS.join(', ')}.`,
        );
      }
      if (section === 'about') {
        throw new BadRequestError(
          'The "about" section is a single text block, not a collection; read it from GET /api/profile.',
        );
      }

      const profile = await buildProfile(
        parseVanityName(vanityName, { allowBareVanity: true }),
        `https://www.linkedin.com/in/${vanityName}`,
        fetchers,
        { expand: [section as SectionKey] },
      ).catch(toApiError);

      res.json({
        vanityName: profile.vanityName,
        section,
        ...(profile[section as keyof ProfileData] as object),
        extractionWarnings: profile.extractionWarnings,
        fetchedAt: profile.fetchedAt,
        cached: profile.cached,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
