import { decodeFlightResponse } from '../../src/linkedin/flightDecoder';
import { getSectionTotalCount, SECTION_MARKER_SUFFIXES } from '../../src/linkedin/sectionDispatcher';
import { parseEducation } from '../../src/linkedin/parsers/educationParser';
import { loadCardFromHar, PART1_WITHOUT_EXP } from './loadCardFromHar';

const HAR_PATH = process.argv[2] ?? 'har_collection/barry-a-6410b4432_full_profile.har';

function main() {
  const raw = loadCardFromHar(HAR_PATH, PART1_WITHOUT_EXP);
  const tree = decodeFlightResponse(raw);
  const education = parseEducation(tree);

  console.log(`HAR: ${HAR_PATH}`);
  console.log(`entries: ${education.length}`);
  console.log(`totalCount: ${getSectionTotalCount(tree, SECTION_MARKER_SUFFIXES.education)}`);
  console.log(JSON.stringify(education, null, 2));
}

main();
