import { decodeFlightResponse } from './flightDecoder';
import { getSectionTotalCount } from './sectionDispatcher';
import { parseAbout } from './parsers/aboutParser';
import { parseTopcard } from './parsers/topcardParser';
import { CARD_IDS, SECTION_REGISTRY, cardsFor } from './sectionRegistry';
import { ProfileData, SectionEnvelope } from '../types/profile';
import { SectionKey } from '../types/sections';

export interface FetchResult {
  text: string;
  cached: boolean;
}

export interface ProfileFetchers {
  fetchCard(vanityName: string, cardId: string): Promise<FetchResult>;
  fetchDocument(vanityName: string): Promise<FetchResult>;
}

export interface BuildProfileOptions {
  expand?: SectionKey[];
}

function emptyEnvelope<T>(): SectionEnvelope<T> {
  return { items: [], truncated: false };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function buildProfile(
  vanityName: string,
  profileUrl: string,
  fetchers: ProfileFetchers,
  options: BuildProfileOptions = {},
): Promise<ProfileData> {
  const warnings: string[] = [];
  let allCached = true;
  let anySucceeded = false;

 let topcard: Awaited<ReturnType<typeof parseTopcard>> | undefined;
  try {
    const doc = await fetchers.fetchDocument(vanityName);
    allCached = allCached && doc.cached;
    topcard = parseTopcard(doc.text, warnings);
    anySucceeded = true;
  } catch (err) {
    warnings.push(`topcard: ${describe(err)}`);
  }

  const cardIds = [...new Set([CARD_IDS.aboveActivity, ...cardsFor(SECTION_REGISTRY)])];
  const trees = new Map<string, unknown>();

  await Promise.all(
    cardIds.map(async (cardId) => {
      try {
        const card = await fetchers.fetchCard(vanityName, cardId);
        allCached = allCached && card.cached;
        trees.set(cardId, decodeFlightResponse(card.text));
        anySucceeded = true;
      } catch (err) {
        warnings.push(`card ${cardId.split('.').pop()}: ${describe(err)}`);
      }
    }),
  );

  if (!anySucceeded) {
    throw new Error(`Could not fetch any data for profile "${vanityName}"`);
  }

  let about: string | undefined;
  const aboutTree = trees.get(CARD_IDS.aboveActivity);
  if (aboutTree !== undefined) {
    try {
      about = parseAbout(aboutTree);
    } catch (err) {
      warnings.push(`about: ${describe(err)}`);
    }
  }

  const expand = new Set(options.expand ?? []);
  const sections: Partial<Record<SectionKey, SectionEnvelope<unknown>>> = {};

  for (const definition of SECTION_REGISTRY) {
    const tree = trees.get(definition.cardId);
    if (tree === undefined) {
      sections[definition.key] = emptyEnvelope();
      continue;
    }

    try {
      const items = definition.parse(tree, warnings);
      const totalCount = getSectionTotalCount(tree, definition.marker);
      const truncated = totalCount !== undefined && items.length < totalCount;

      if (expand.has(definition.key)) {
        warnings.push(
          definition.detailsParser
            ? `${definition.key}: expansion requested but returned no additional items`
            : `${definition.key}: expansion is not yet available; returning the profile-card preview`,
        );
      }

      sections[definition.key] = { items, totalCount, truncated };
    } catch (err) {
      warnings.push(`${definition.key}: ${describe(err)}`);
      sections[definition.key] = emptyEnvelope();
    }
  }

  return {
    profileUrl,
    vanityName,
    name: topcard?.name,
    headline: topcard?.headline,
    location: topcard?.location,
    pronouns: topcard?.pronouns,
    profileImageUrl: topcard?.profileImageUrl,
    bannerImageUrl: topcard?.bannerImageUrl,
    about,
    experience: (sections.experience ?? emptyEnvelope()) as ProfileData['experience'],
    education: (sections.education ?? emptyEnvelope()) as ProfileData['education'],
    skills: (sections.skills ?? emptyEnvelope()) as ProfileData['skills'],
    certifications: (sections.certifications ?? emptyEnvelope()) as ProfileData['certifications'],
    volunteer: (sections.volunteer ?? emptyEnvelope()) as ProfileData['volunteer'],
    projects: (sections.projects ?? emptyEnvelope()) as ProfileData['projects'],
    extractionWarnings: warnings,
    fetchedAt: new Date().toISOString(),
    cached: allCached,
  };
}
