import { decodeFlightResponse, extractOrderedTextLeaves } from '../../src/linkedin/flightDecoder';
import { findSectionSubtree, SECTION_MARKER_SUFFIXES } from '../../src/linkedin/sectionDispatcher';
import { segmentFixedFieldEntries } from '../../src/linkedin/parsers/genericEntryParser';
import { fetchProfileCard } from '../../src/linkedin/client';

async function main() {
  const session = {
    cookie: 'li_at=; JSESSIONID="ajax:"', // paste here real session values
    csrfToken: 'ajax:', // must match JSESSIONID
  };

  const raw = await fetchProfileCard(
    'sp35',
    'com.linkedin.sdui.generated.profile.dsl.impl.profileCardsBelowActivityPart1WithoutExp',
    session,
  );

  const tree = decodeFlightResponse(raw);

  const eduSubtree = findSectionSubtree(tree, SECTION_MARKER_SUFFIXES.education);
  const eduLeaves = eduSubtree ? extractOrderedTextLeaves(eduSubtree) : [];
  console.log('Education leaves:', eduLeaves);
  console.log('Education entries:', segmentFixedFieldEntries(eduLeaves, 2));

  const projectsSubtree = findSectionSubtree(tree, SECTION_MARKER_SUFFIXES.projects);
  const projectLeaves = projectsSubtree ? extractOrderedTextLeaves(projectsSubtree) : [];
  console.log('Project leaves:', projectLeaves);
  console.log('Project entries:', segmentFixedFieldEntries(projectLeaves, 1));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});