import { decodeFlightResponse } from '../../src/linkedin/flightDecoder';
import { getSectionTotalCount, SECTION_MARKER_SUFFIXES } from '../../src/linkedin/sectionDispatcher';
import { parseProjects } from '../../src/linkedin/parsers/projectParser';
import { loadCardFromHar, PART1_WITHOUT_EXP } from './loadCardFromHar';

// Regression fixture: profile `sp35` (known-good in CLAUDE.md — 2 entries,
// "Project OneTap" and "Studydeck", of 3 total). Pass the shaswata-gogoi HAR
// as an argument for the empty-section control, where Projects is absent.
const HAR_PATH = process.argv[2] ?? 'har_collection/padamkataria_full_profile.har';

function main() {
  const raw = loadCardFromHar(HAR_PATH, PART1_WITHOUT_EXP);
  const tree = decodeFlightResponse(raw);
  const projects = parseProjects(tree);

  console.log(`HAR: ${HAR_PATH}`);
  console.log(`entries: ${projects.length}`);
  console.log(`totalCount: ${getSectionTotalCount(tree, SECTION_MARKER_SUFFIXES.projects)}`);
  console.log(JSON.stringify(projects, null, 2));
}

main();
