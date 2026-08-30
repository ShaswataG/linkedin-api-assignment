import { findSectionSubtree, SECTION_MARKER_SUFFIXES } from '../sectionDispatcher';
import { extractOrderedTextLeaves } from '../flightDecoder';
import { segmentFixedFieldEntries } from './genericEntryParser';

export interface ProjectEntry {
  title: string;
  startDate: string;
  endDate: string;
  associatedWith?: string;
  description?: string;
}

export function parseProjects(cardTree: unknown): ProjectEntry[] {
  const subtree = findSectionSubtree(cardTree, SECTION_MARKER_SUFFIXES.projects);
  if (!subtree) return [];

  const leaves = extractOrderedTextLeaves(subtree);
  const withoutHeader = leaves[0] === 'Projects' ? leaves.slice(1) : leaves;

  const entries = segmentFixedFieldEntries(withoutHeader, 1);

  return entries.map((e) => {
    const dashMatch = e.dateRange.match(/^(.*?)\s*[-–]\s*(.*)$/);
    const associatedWith = e.extras.find((x) => x.startsWith('Associated with'));
    const description = e.extras.filter((x) => x !== associatedWith).join(' ');
    return {
      title: e.fields[0] ?? '',
      startDate: dashMatch ? dashMatch[1].trim() : '',
      endDate: dashMatch ? dashMatch[2].trim() : '',
      associatedWith,
      description: description || undefined,
    };
  });
}