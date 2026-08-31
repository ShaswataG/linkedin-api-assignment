import { findSectionSubtree, SECTION_MARKER_SUFFIXES } from '../sectionDispatcher';
import { extractOrderedTextLeaves } from '../flightDecoder';
import { DATE_LEAF_PATTERN, splitDateRange } from '../fieldUtils';
import { decodeFlightResponse } from '../flightDecoder';
import { findComponentItems } from '../sectionDispatcher';

export interface EducationEntry {
  institution: string;
  degree?: string;
  startDate?: string;
  endDate?: string;
  grade?: string;
  activities?: string;
  description?: string;
}

const GRADE_PREFIX = /^Grade:\s*/i;
const ACTIVITIES_PREFIX = /^Activities and societies:\s*/i;

const SINGLE_DATE_LEAF_PATTERN = /^([A-Za-z]{3,9}\.?\s?\d{4}|\d{4})$/;

const isDateLeaf = (s: string) => DATE_LEAF_PATTERN.test(s) || SINGLE_DATE_LEAF_PATTERN.test(s);

const isLabelledExtra = (s: string) => GRADE_PREFIX.test(s) || ACTIVITIES_PREFIX.test(s);

function looksLikeHeaderLeaf(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 100 && !/[.!?]$/.test(t) && !isLabelledExtra(t) && !isDateLeaf(t);
}

function buildEducationEntry(
  header: string[],
  dateRange: string,
  extras: string[],
): EducationEntry {
  const gradeLeaf = extras.find((x) => GRADE_PREFIX.test(x));
  const activitiesLeaf = extras.find((x) => ACTIVITIES_PREFIX.test(x));
  const description = extras.filter((x) => !isLabelledExtra(x)).join(' ');

  const { startDate, endDate } = !dateRange
    ? { startDate: '', endDate: '' }
    : SINGLE_DATE_LEAF_PATTERN.test(dateRange)
      ? { startDate: '', endDate: dateRange }
      : splitDateRange(dateRange);
  return {
    institution: header[0] ?? '',
    degree: header[1],
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    grade: gradeLeaf?.replace(GRADE_PREFIX, '').trim() || undefined,
    activities: activitiesLeaf?.replace(ACTIVITIES_PREFIX, '').trim() || undefined,
    description: description || undefined,
  };
}

export function parseEducation(cardTree: unknown): EducationEntry[] {
  const subtree = findSectionSubtree(cardTree, SECTION_MARKER_SUFFIXES.education);
  if (!subtree) return [];

  const leaves = extractOrderedTextLeaves(subtree)
    .map((l) => l.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean);
  const body = leaves[0] === 'Education' ? leaves.slice(1) : leaves;
  if (body.length === 0) return [];

  const dateIndices: number[] = [];
  body.forEach((leaf, i) => {
    if (isDateLeaf(leaf)) dateIndices.push(i);
  });

  const MAX_HEADER_LEAVES = 2; // institution + degree

  const headStartOf = (dateIndex: number): number => {
    let start = dateIndex;
    while (
      start - 1 >= 0 &&
      dateIndex - (start - 1) <= MAX_HEADER_LEAVES &&
      looksLikeHeaderLeaf(body[start - 1])
    ) {
      start -= 1;
    }
    return start;
  };

  const build = buildEducationEntry;

  const entries: EducationEntry[] = [];

  if (dateIndices.length === 0) {
    const headerLeaves = body.filter(looksLikeHeaderLeaf);
    for (let i = 0; i < headerLeaves.length; i += MAX_HEADER_LEAVES) {
      entries.push(build(headerLeaves.slice(i, i + MAX_HEADER_LEAVES), '', []));
    }
    return entries;
  }

  dateIndices.forEach((dateIndex, n) => {
    const headStart = headStartOf(dateIndex);
    const extrasEnd = n + 1 < dateIndices.length ? headStartOf(dateIndices[n + 1]) : body.length;
    entries.push(
      build(body.slice(headStart, dateIndex), body[dateIndex], body.slice(dateIndex + 1, extrasEnd)),
    );
  });

  const last = entries[entries.length - 1];
  const trailing = body.slice(dateIndices[dateIndices.length - 1] + 1);

  const MAX_TRAILING_FOR_RECOVERY = 4;

  const recovered: string[] = [];
  if (trailing.length <= MAX_TRAILING_FOR_RECOVERY) {
    for (let i = trailing.length - 1; i >= 0 && recovered.length < MAX_HEADER_LEAVES; i--) {
      if (!looksLikeHeaderLeaf(trailing[i])) break;
      recovered.unshift(trailing[i]);
    }
  }
  if (recovered.length > 0) {
    const keptExtras = trailing.slice(0, trailing.length - recovered.length);
    const gradeLeaf = keptExtras.find((x) => GRADE_PREFIX.test(x));
    const activitiesLeaf = keptExtras.find((x) => ACTIVITIES_PREFIX.test(x));
    last.grade = gradeLeaf?.replace(GRADE_PREFIX, '').trim() || undefined;
    last.activities = activitiesLeaf?.replace(ACTIVITIES_PREFIX, '').trim() || undefined;
    last.description = keptExtras.filter((x) => !isLabelledExtra(x)).join(' ') || undefined;
    entries.push(build(recovered, '', []));
  }

  return entries;
}

const UUID_ITEM_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DETAILS_CHROME = [/^Skills:$/i, /^Education$/, /^Show all/i, /^…$/, /^more$/i];

export function parseEducationDetails(
  flightText: string,
  warnings: string[] = [],
): EducationEntry[] {
  let tree: unknown;
  try {
    tree = decodeFlightResponse(flightText);
  } catch (err) {
    warnings.push(`education: could not decode the details response (${String(err)})`);
    return [];
  }

  const entries: EducationEntry[] = [];

  for (const item of findComponentItems(tree, UUID_ITEM_KEY)) {
    const leaves = extractOrderedTextLeaves(item)
      .map((l) => l.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim())
      .filter((l) => l.length > 0 && !DETAILS_CHROME.some((p) => p.test(l)));
    if (leaves.length === 0) continue;

    const dateIndex = leaves.findIndex(isDateLeaf);
    if (dateIndex === -1) {
      const header = leaves.filter(looksLikeHeaderLeaf).slice(0, 2);
      entries.push(
        buildEducationEntry(header, '', leaves.filter((l) => !header.includes(l))),
      );
      continue;
    }

    let headStart = dateIndex;
    while (
      headStart - 1 >= 0 &&
      dateIndex - (headStart - 1) <= 2 &&
      looksLikeHeaderLeaf(leaves[headStart - 1])
    ) {
      headStart -= 1;
    }

    entries.push(
      buildEducationEntry(
        leaves.slice(headStart, dateIndex),
        leaves[dateIndex],
        leaves.slice(dateIndex + 1),
      ),
    );
  }

  if (entries.length === 0) warnings.push('education: details response contained no entries');
  return entries;
}
