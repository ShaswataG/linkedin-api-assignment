import { decodeFlightResponse } from './flightDecoder';
import { extractProfileId, getSectionTotalCount, sectionHasShowAll } from './sectionDispatcher';
import { parseAbout } from './parsers/aboutParser';
import { parseTopcard } from './parsers/topcardParser';
import { CARD_IDS, SECTION_REGISTRY, cardsFor, cardServesOneSection } from './sectionRegistry';
import { DETAILS_PAGE_SIZE } from './client';

const MAX_DETAIL_PAGES = 40;
import { ProfileData, SectionEnvelope } from '../types/profile';
import { SectionKey } from '../types/sections';

export type DetailsRequest =
  | { kind: 'html'; path: string }
  | {
      kind: 'pagination';
      pagerId: string;
      screenId: string;
      sectionRef: string;
      profileId: string;
      refererPath: string;
      start: number;
      count: number;
    };

export interface FetchResult {
  text: string;
  cached: boolean;
}

export interface ProfileFetchers {
  fetchCard(vanityName: string, cardId: string): Promise<FetchResult>;
  fetchDocument(vanityName: string): Promise<FetchResult>;
  fetchDetails?(vanityName: string, request: DetailsRequest): Promise<FetchResult>;
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

async function expandSection(
  definition: (typeof SECTION_REGISTRY)[number],
  vanityName: string,
  profileId: string | undefined,
  fetchers: ProfileFetchers,
  preview: unknown[],
  warnings: string[],
): Promise<{ items: unknown[]; expanded: boolean; cached: boolean }> {
  const spec = definition.details;
  if (!spec || !definition.detailsParser) {
    warnings.push(
      `${definition.key}: expansion is not yet available; returning the profile-card preview`,
    );
    return { items: preview, expanded: false, cached: true };
  }
  if (!fetchers.fetchDetails) {
    warnings.push(`${definition.key}: expansion unavailable (no details fetcher configured)`);
    return { items: preview, expanded: false, cached: true };
  }
  if (spec.kind === 'pagination' && !profileId) {
    warnings.push(`${definition.key}: expansion needs a profile id that could not be derived`);
    return { items: preview, expanded: false, cached: true };
  }

  try {
    if (spec.kind === 'html') {
      const page = await fetchers.fetchDetails(vanityName, { kind: 'html', path: spec.path });
      const full = definition.detailsParser(page.text, warnings);
      if (full.length === 0) {
        warnings.push(`${definition.key}: details response contained no entries; kept the preview`);
        return { items: preview, expanded: false, cached: page.cached };
      }
      if (full.length >= DETAILS_PAGE_SIZE) {
        warnings.push(
          `${definition.key}: details page returned a full page (${full.length}); ` +
            'later pages load on scroll and are not retrievable from the HTML',
        );
        return { items: full, expanded: false, cached: page.cached };
      }
      return { items: full, expanded: true, cached: page.cached };
    }

    const all: unknown[] = [];
    const seen = new Set<string>();
    let cachedAll = true;
    let start = 0;
    let pages = 0;

    while (pages < MAX_DETAIL_PAGES) {
      const page = await fetchers.fetchDetails(vanityName, {
        kind: 'pagination',
        pagerId: spec.pagerId,
        screenId: spec.screenId,
        sectionRef: `com.linkedin.sdui.profile.card.ref${profileId}${spec.sectionRefSuffix}`,
        profileId: profileId as string,
        refererPath: spec.refererPath,
        start,
        count: DETAILS_PAGE_SIZE,
      });
      cachedAll = cachedAll && page.cached;
      pages += 1;

      const parsed = definition.detailsParser(page.text, warnings);

      if (parsed.length === 0) {
        if (start === 0) {
          start += DETAILS_PAGE_SIZE;
          continue;
        }
        break;
      }

      for (const entry of parsed) {
        const key = JSON.stringify(entry);
        if (!seen.has(key)) {
          seen.add(key);
          all.push(entry);
        }
      }

      if (parsed.length < DETAILS_PAGE_SIZE) break;
      start += DETAILS_PAGE_SIZE;
    }

    if (all.length === 0) {
      warnings.push(`${definition.key}: details response contained no entries; kept the preview`);
      return { items: preview, expanded: false, cached: cachedAll };
    }
    if (pages >= MAX_DETAIL_PAGES) {
      warnings.push(
        `${definition.key}: stopped after ${MAX_DETAIL_PAGES} pages; more entries may exist`,
      );
      return { items: all, expanded: false, cached: cachedAll };
    }
    return { items: all, expanded: true, cached: cachedAll };
  } catch (err) {
    warnings.push(`${definition.key}: expansion failed (${describe(err)}); kept the preview`);
    return { items: preview, expanded: false, cached: true };
  }
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
      let items = definition.parse(tree, warnings);
      const totalCount = getSectionTotalCount(tree, definition.marker);

      const cardTruncated =
        (totalCount !== undefined && items.length < totalCount) ||
        sectionHasShowAll(tree, definition.marker, {
          allowCardLevel: cardServesOneSection(definition.cardId),
        });

      let expanded = false;
      if (expand.has(definition.key)) {
        const result = await expandSection(
          definition,
          vanityName,
          extractProfileId(tree, definition.marker),
          fetchers,
          items,
          warnings,
        );
        items = result.items;
        expanded = result.expanded;
        allCached = allCached && result.cached;
      }

      sections[definition.key] = {
        items,
        totalCount,
        truncated: expanded
          ? totalCount !== undefined && items.length < totalCount
          : cardTruncated,
      };
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
