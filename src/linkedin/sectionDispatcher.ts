import { extractOrderedTextLeaves } from './flightDecoder';

export const SECTION_MARKER_SUFFIXES = {
  about: 'About',
  education: 'EducationTopLevelSection',
  certifications: 'CertificationTopLevel',
  volunteer: 'VolunteerExperienceTopLevel',
  projects: 'Projects',
  recommendations: 'RecommendationsTopLevel',
  honors: 'HonorsTopLevel',
  publications: 'PublicationTopLevelSection',
  patents: 'Patents',
  testScores: 'TestScoresTopLevel',
  courses: 'CourseTopLevelSection',
  languages: 'LanguageTopLevel',
  organizations: 'Organizations',
  causes: 'Causes',
  skills: 'Skills',
} as const;

export type SectionKey = keyof typeof SECTION_MARKER_SUFFIXES;

export function detectSectionsInRawResponse(rawText: string): SectionKey[] {
  const found: SectionKey[] = [];
  for (const [key, suffix] of Object.entries(SECTION_MARKER_SUFFIXES) as [SectionKey, string][]) {
    if (rawText.includes(suffix)) {
      found.push(key);
    }
  }
  return found;
}

export function findSectionSubtree(tree: unknown, markerSuffix: string): unknown | null {
  let found: unknown | null = null;

  function walk(node: unknown): void {
    if (found) return; // stop as soon as we've found the first match

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
        if (found) return;
      }
      return;
    }

    if (node && typeof node === 'object') {
      const id = (node as Record<string, unknown>).id;
      const componentkey = (node as Record<string, unknown>).componentkey;
      if (
        (typeof id === 'string' && id.endsWith(markerSuffix)) ||
        (typeof componentkey === 'string' && componentkey.endsWith(markerSuffix))
      ) {
        found = node;
        return;
      }
      for (const value of Object.values(node)) {
        walk(value);
        if (found) return;
      }
    }
  }

  walk(tree);
  return found;
}

export function getSectionTotalCount(
  cardTree: unknown,
  markerSuffix: string,
): number | undefined {
  const countIdPattern = new RegExp(`^${markerSuffix}.*-count$`);
  let found: number | undefined;

  function walk(node: unknown): void {
    if (found !== undefined) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
        if (found !== undefined) return;
      }
      return;
    }

    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      // Shape: { key: { key: { value: { $case: 'id', id } } },
      //          value: { $case: 'intValue', intValue } }
      const id = (((record.key as any)?.key)?.value)?.id;
      const intValue = (record.value as any)?.intValue;
      if (typeof id === 'string' && countIdPattern.test(id) && typeof intValue === 'number') {
        found = intValue;
        return;
      }
      for (const value of Object.values(record)) {
        walk(value);
        if (found !== undefined) return;
      }
    }
  }

  walk(cardTree);
  if (found !== undefined) return found;

  const subtree = findSectionSubtree(cardTree, markerSuffix);
  if (!subtree) return undefined;
  const headerMatch = extractOrderedTextLeaves(subtree)[0]?.match(/\((\d+)\)\s*$/);
  return headerMatch ? Number(headerMatch[1]) : undefined;
}

export function sectionHasContent(cardTree: unknown, markerSuffix: string): boolean {
  const subtree = findSectionSubtree(cardTree, markerSuffix);
  if (!subtree) return false;
  return extractOrderedTextLeaves(subtree).length > 0;
}

export function findEntityCollectionItems(subtree: unknown): unknown[] {
  const items: unknown[] = [];

  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (node && typeof node === 'object') {
      const componentkey = (node as Record<string, unknown>).componentkey;
      if (typeof componentkey === 'string' && /^entity-collection-item-/.test(componentkey)) {
        items.push(node);
        return; // don't recurse further into a matched item — avoids
        // false nested matches; sibling items are still found normally
        // since this only stops descent into THIS node, not the walk
        // over the array/object that contains its siblings.
      }
      for (const value of Object.values(node)) walk(value);
    }
  }

  walk(subtree);
  return items;
}

export async function discoverBelowActivitySections(
  fetchCard: (componentId: string) => Promise<string>,
): Promise<Partial<Record<SectionKey, string>>> {
  const results: Partial<Record<SectionKey, string>> = {};

  const candidateComponentIds = [
    'com.linkedin.sdui.generated.profile.dsl.impl.profileCardsBelowActivityPart1WithoutExp',
    ...Array.from({ length: 6 }, (_, i) =>
      `com.linkedin.sdui.generated.profile.dsl.impl.profileCardsBelowActivityPart${i + 2}`,
    ),
  ];

  for (const componentId of candidateComponentIds) {
    let rawText: string;
    try {
      rawText = await fetchCard(componentId);
    } catch {
      continue; // a missing part for this profile — not an error
    }

    const sections = detectSectionsInRawResponse(rawText);
    for (const section of sections) {
      results[section] = rawText; // same raw text may serve multiple sections bundled together
    }
  }

  return results;
}