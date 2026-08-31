import { Position, ExperienceEntry } from '../../api/routes/profile';
import {
  DATE_RANGE_PATTERN,
  DATE_LEAF_PATTERN,
  DURATION_ONLY_PATTERN,
  middotParts,
  splitMiddotField,
  splitDateRange,
  extractLocation,
} from '../fieldUtils';
import { findEntityCollectionItems } from '../sectionDispatcher';
import { extractOrderedTextLeaves } from '../flightDecoder';
import { extractDetailItems } from '../detailsPage';

const isDateLeaf = (s: string) => DATE_LEAF_PATTERN.test(s);
const isDurationLeaf = (s: string) => DURATION_ONLY_PATTERN.test(s);

const EMPLOYMENT_TYPES = new Set([
  'Full-time',
  'Part-time',
  'Self-employed',
  'Freelance',
  'Contract',
  'Internship',
  'Apprenticeship',
  'Seasonal',
]);

const isEmploymentType = (s: string) => EMPLOYMENT_TYPES.has(s.trim());

function readPlace(
  leaf: string,
  options: { allowBarePlaceName?: boolean } = {},
): { location?: string; locationType?: string } | null {
  const viaArrangement = extractLocation([leaf]);
  if (viaArrangement.location || viaArrangement.locationType) {
    return { location: viaArrangement.location, locationType: viaArrangement.locationType };
  }
  const trimmed = leaf.trim();
  if (trimmed.length > 80 || /[.!?]$/.test(trimmed)) return null;

  if (trimmed.includes(',') || /\b(Area|Region|Metropolitan|Greater)\b/.test(trimmed)) {
    return { location: trimmed };
  }

  if (
    options.allowBarePlaceName &&
    trimmed.length <= 40 &&
    trimmed.split(/\s+/).length <= 4 &&
    /^[A-Z][^\s]*(\s+[A-Z][^\s]*)*$/.test(trimmed)
  ) {
    return { location: trimmed };
  }
  return null;
}

function isGroupedItem(leaves: string[]): boolean {
  const parts = middotParts(leaves[1] ?? '');
  if (parts.length === 0) return false;
  return parts.every((p) => isEmploymentType(p) || isDurationLeaf(p));
}

const CHROME_PATTERNS: RegExp[] = [
  /^LinkedIn helped me get this job/,
  /^Certificate$/,
  /\.(pdf|png|jpe?g|docx?|pptx?)$/i, // media/attachment filenames
];

function cleanItemLeaves(leaves: string[]): string[] {
  return leaves
    .map((leaf) => leaf.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter((leaf) => leaf.length > 0 && !CHROME_PATTERNS.some((p) => p.test(leaf)));
}

function buildPosition(title: string, dateRange: string, extras: string[]): Position {
  let rest = extras;
  let place: { location?: string; locationType?: string } | null = null;
  if (rest.length > 0) {
    place = readPlace(rest[0], { allowBarePlaceName: true });
    if (place) rest = rest.slice(1);
  }

  const { startDate, endDate, duration } = splitDateRange(dateRange);
  return {
    title,
    startDate,
    endDate,
    duration,
    location: place?.location,
    locationType: place?.locationType,
    description: rest.join(' ') || undefined,
  };
}

function parseFlatItem(leaves: string[], warnings: string[]): ExperienceEntry {
  const title = leaves[0] ?? '';

  const parts = middotParts(leaves[1] ?? '');
  const employmentType = parts.find(isEmploymentType);
  const companyName =
    parts.find((p) => !isEmploymentType(p) && !isDurationLeaf(p)) ?? parts[0] ?? '';

  const dateIndex = leaves.findIndex((leaf, i) => i >= 1 && isDateLeaf(leaf));

  if (dateIndex === -1) {
    warnings.push(`experience: no date range found for "${title}"; dates left empty`);
    return {
      companyName,
      employmentType,
      positions: [buildPosition(title, '', leaves.slice(2))],
    };
  }

  return {
    companyName,
    employmentType,
    positions: [buildPosition(title, leaves[dateIndex], leaves.slice(dateIndex + 1))],
  };
}

function parseGroupedItem(leaves: string[], warnings: string[]): ExperienceEntry {
  const companyName = leaves[0] ?? '';

  const headerParts = middotParts(leaves[1] ?? '');
  const employmentType = headerParts.find(isEmploymentType);
  const totalDuration = headerParts.find(isDurationLeaf);

  let i = 2;

  let location: string | undefined;
  let locationType: string | undefined;
  if (i < leaves.length && !isDateLeaf(leaves[i])) {
    const place = readPlace(leaves[i]);
    if (place) {
      location = place.location;
      locationType = place.locationType;
      i += 1;
    }
  }

  const dateIndices: number[] = [];
  for (let k = i; k < leaves.length; k++) {
    if (isDateLeaf(leaves[k])) dateIndices.push(k);
  }

  const MAX_HEAD_LEAVES = 3; // title + at most an employment type and a place

  const headStartOf = (dateIndex: number): number => {
    let start = dateIndex;
    while (
      start - 1 >= i &&
      dateIndex - (start - 1) <= MAX_HEAD_LEAVES &&
      !isDateLeaf(leaves[start - 1])
    ) {
      const candidate = leaves[start - 1];
      start -= 1;

      if (!isEmploymentType(candidate) && !readPlace(candidate)) break;
    }
    return start;
  };

  const positions: Position[] = [];
  dateIndices.forEach((dateIndex, n) => {
    const headStart = headStartOf(dateIndex);
    const head = leaves.slice(headStart, dateIndex);
    if (head.length === 0) {
      warnings.push(`experience: role under "${companyName}" has a date where a title was expected`);
    }

    const roleEmploymentType = head.find(isEmploymentType);
    const roleTitle = head.find((h) => !isEmploymentType(h) && !readPlace(h)) ?? '';
    const headPlaceLeaf = head.find((h) => !isEmploymentType(h) && readPlace(h));

    const extrasEnd =
      n + 1 < dateIndices.length ? headStartOf(dateIndices[n + 1]) : leaves.length;
    const extras = leaves.slice(dateIndex + 1, extrasEnd);

    const position = buildPosition(roleTitle, leaves[dateIndex], extras);
    if (headPlaceLeaf) {
      const place = readPlace(headPlaceLeaf)!;
      position.location = place.location;
      position.locationType = place.locationType;
    }
    if (roleEmploymentType) position.employmentType = roleEmploymentType;
    positions.push(position);
  });

  if (positions.length === 0) {
    warnings.push(`experience: grouped entry "${companyName}" yielded no roles`);
  }

  return { companyName, employmentType, totalDuration, location, locationType, positions };
}

export function parseExperience(cardTree: unknown, warnings: string[] = []): ExperienceEntry[] {
  const items = findEntityCollectionItems(cardTree);

  if (items.length === 0) {
    warnings.push(
      'experience: no entity-collection-item boundaries found; ' +
        'fell back to positional segmentation',
    );
    return segmentExperienceLeaves(extractOrderedTextLeaves(cardTree));
  }

  return parseExperienceItems(items.map((item) => extractOrderedTextLeaves(item)), warnings);
}


export function parseExperienceItems(
  rawItemLeaves: string[][],
  warnings: string[] = [],
): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  for (const raw of rawItemLeaves) {
    const leaves = cleanItemLeaves(raw);
    if (leaves.length === 0) continue;

    const grouped = isGroupedItem(leaves);

    const dateLeafCount = leaves.filter(isDateLeaf).length;
    if (!grouped && dateLeafCount > 1) {
      warnings.push(
        `experience: "${leaves[0]}" looks flat but contains ${dateLeafCount} date ranges; ` +
          `roles after the first may be folded into the description`,
      );
    }

    entries.push(
      grouped ? parseGroupedItem(leaves, warnings) : parseFlatItem(leaves, warnings),
    );
  }

  return entries;
}

export function segmentExperienceLeaves(leaves: string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  let i = 0;

  const isDate = (s: string) => DATE_RANGE_PATTERN.test(s);
  const isDuration = (s: string) => DURATION_ONLY_PATTERN.test(s);

  const isGroupedStart = (idx: number) =>
    idx + 3 < leaves.length &&
    !isDate(leaves[idx]) &&
    isDuration(leaves[idx + 1]) &&
    !isDate(leaves[idx + 2]) &&
    isDate(leaves[idx + 3]);

  const isFlatStart = (idx: number) =>
    idx + 2 < leaves.length &&
    !isDate(leaves[idx]) &&
    !isDuration(leaves[idx + 1]) &&
    !isDate(leaves[idx + 1]) &&
    isDate(leaves[idx + 2]);

  const isRolePairStart = (idx: number) =>
    idx + 1 < leaves.length && !isDate(leaves[idx]) && isDate(leaves[idx + 1]);

  while (i < leaves.length) {
    if (isGroupedStart(i)) {
      const companyName = leaves[i];
      const totalDuration = leaves[i + 1];
      i += 2;

      const positions: Position[] = [];
      while (i < leaves.length && isRolePairStart(i)) {
        const title = leaves[i];
        const dateRange = leaves[i + 1];
        i += 2;

        const extras: string[] = [];
        while (i < leaves.length && !isRolePairStart(i) && !isFlatStart(i) && !isGroupedStart(i)) {
          extras.push(leaves[i]);
          i += 1;
        }

        const { location, locationType, remainingExtras } = extractLocation(extras);
        const { startDate, endDate, duration } = splitDateRange(dateRange);
        positions.push({
          title,
          startDate,
          endDate,
          duration,
          location,
          locationType,
          description: remainingExtras.join(' '),
        });
      }

      const { primary: companyNameOnly } = splitMiddotField(companyName);
      entries.push({ companyName: companyNameOnly, totalDuration, positions });
      continue;
    }

    if (isFlatStart(i)) {
      const title = leaves[i];
      const companyRaw = leaves[i + 1];
      const dateRange = leaves[i + 2];
      i += 3;

      const extras: string[] = [];
      while (i < leaves.length && !isFlatStart(i) && !isGroupedStart(i)) {
        extras.push(leaves[i]);
        i += 1;
      }

      const { primary: companyName, secondary: employmentType } = splitMiddotField(companyRaw);
      const { location, locationType, remainingExtras } = extractLocation(extras);
      const { startDate, endDate, duration } = splitDateRange(dateRange);
      entries.push({
        companyName,
        employmentType,
        positions: [
          { title, startDate, endDate, duration, location, locationType, description: remainingExtras.join(' ') },
        ],
      });
      continue;
    }

    // Leading noise (e.g. the literal section header text "Experience") — discard.
    i += 1;
  }

  return entries;
}

export function parseExperienceDetails(
  html: string,
  warnings: string[] = [],
): ExperienceEntry[] {
  const items = extractDetailItems(html);
  if (items.length === 0) {
    warnings.push('experience: details page contained no entries');
    return [];
  }

  const entries = parseExperienceItems(
    items.map((item) => item.leaves),
    warnings,
  );

  const withSkills = items.filter((item) => item.leaves.length > 0);
  entries.forEach((entry, i) => {
    const item = withSkills[i];
    if (!item) return;
    if (item.skills.length > 0) entry.skills = item.skills;
    if (item.unnamedSkillCount > 0) entry.unnamedSkillCount = item.unnamedSkillCount;
  });

  return entries;
}
