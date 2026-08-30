import { findSectionSubtree, SECTION_MARKER_SUFFIXES } from '../sectionDispatcher';
import { extractOrderedTextLeaves } from '../flightDecoder';
import { DATE_LEAF_PATTERN, splitDateRange } from '../fieldUtils';

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

const isDateLeaf = (s: string) => DATE_LEAF_PATTERN.test(s);

const isLabelledExtra = (s: string) => GRADE_PREFIX.test(s) || ACTIVITIES_PREFIX.test(s);

function looksLikeHeaderLeaf(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 100 && !/[.!?]$/.test(t) && !isLabelledExtra(t) && !isDateLeaf(t);
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

  const build = (header: string[], dateRange: string, extras: string[]): EducationEntry => {
    const gradeLeaf = extras.find((x) => GRADE_PREFIX.test(x));
    const activitiesLeaf = extras.find((x) => ACTIVITIES_PREFIX.test(x));
    const description = extras.filter((x) => !isLabelledExtra(x)).join(' ');
    const { startDate, endDate } = dateRange ? splitDateRange(dateRange) : { startDate: '', endDate: '' };
    return {
      institution: header[0] ?? '',
      degree: header[1],
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      grade: gradeLeaf?.replace(GRADE_PREFIX, '').trim() || undefined,
      activities: activitiesLeaf?.replace(ACTIVITIES_PREFIX, '').trim() || undefined,
      description: description || undefined,
    };
  };

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
  const recovered: string[] = [];
  for (let i = trailing.length - 1; i >= 0 && recovered.length < MAX_HEADER_LEAVES; i--) {
    if (!looksLikeHeaderLeaf(trailing[i])) break;
    recovered.unshift(trailing[i]);
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
