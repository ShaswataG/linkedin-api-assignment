import { findSectionSubtree, SECTION_MARKER_SUFFIXES } from '../sectionDispatcher';
import { extractOrderedTextLeaves } from '../flightDecoder';
import { splitDateRange } from '../fieldUtils';
import { segmentFixedFieldEntries } from './genericEntryParser';

export interface VolunteerEntry {
  role: string;
  organization: string;
  startDate?: string;
  endDate?: string;
  duration?: string;
  cause?: string;
  description?: string;
}

const VOLUNTEER_CAUSES = new Set([
  'Animal Welfare',
  'Arts and Culture',
  'Children',
  'Civil Rights and Social Action',
  'Disaster and Humanitarian Relief',
  'Economic Empowerment',
  'Education',
  'Environment',
  'Health',
  'Human Rights',
  'Politics',
  'Poverty Alleviation',
  'Science and Technology',
  'Social Services',
]);

export function parseVolunteer(cardTree: unknown): VolunteerEntry[] {
  const subtree = findSectionSubtree(cardTree, SECTION_MARKER_SUFFIXES.volunteer);
  if (!subtree) return [];

  const leaves = extractOrderedTextLeaves(subtree);
  const withoutHeader = /^Volunteering/.test(leaves[0] ?? '') ? leaves.slice(1) : leaves;

  const entries = segmentFixedFieldEntries(withoutHeader, 2);

  return entries.map((e) => {
    const { startDate, endDate, duration } = splitDateRange(e.dateRange);

    const hasCause = e.extras.length > 0 && VOLUNTEER_CAUSES.has(e.extras[0]);
    const cause = hasCause ? e.extras[0] : undefined;
    const description = (hasCause ? e.extras.slice(1) : e.extras).join(' ');

    return {
      role: e.fields[0] ?? '',
      organization: e.fields[1] ?? '',
      startDate,
      endDate,
      duration,
      cause,
      description: description || undefined,
    };
  });
}
