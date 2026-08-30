import { findSectionSubtree, SECTION_MARKER_SUFFIXES } from '../sectionDispatcher';
import { extractOrderedTextLeaves } from '../flightDecoder';
import { segmentFixedFieldEntries } from './genericEntryParser';

export interface EducationEntry {
  institution: string;
  degree?: string;
  startDate?: string;
  endDate?: string;
  activities?: string;
  description?: string;
}

export function parseEducation(cardTree: unknown): EducationEntry[] {
  const subtree = findSectionSubtree(cardTree, SECTION_MARKER_SUFFIXES.education);
  if (!subtree) return [];

  const leaves = extractOrderedTextLeaves(subtree);
  const withoutHeader = leaves[0] === 'Education' ? leaves.slice(1) : leaves;

  const entries = segmentFixedFieldEntries(withoutHeader, 2, { recoverTrailingDatelessEntry: true });

  return entries.map((e) => {
    const dashMatch = e.dateRange ? e.dateRange.match(/^(.*?)\s*[-–]\s*(.*)$/) : null;
    return {
      institution: e.fields[0] ?? '',
      degree: e.fields[1],
      startDate: dashMatch?.[1]?.trim(),
      endDate: dashMatch?.[2]?.trim(),
      activities: e.extras.find((x) => x.startsWith('Activities and societies')),
      description:
        e.extras.filter((x) => !x.startsWith('Activities and societies')).join(' ') || undefined,
    };
  });
}