import { decodeFlightResponse } from '../../src/linkedin/flightDecoder';
import { getSectionTotalCount, sectionHasContent, SECTION_MARKER_SUFFIXES } from '../../src/linkedin/sectionDispatcher';
import { parseSkills } from '../../src/linkedin/parsers/skillsParser';
import { loadCardFromHar } from './loadCardFromHar';

const HAR_PATH = process.argv[2] ?? 'har_collection/shaswata-gogoi_full_profile.har';
const SKILLS_CARD = 'profileCardsBelowActivityPart7';

function main() {
  const tree = decodeFlightResponse(loadCardFromHar(HAR_PATH, SKILLS_CARD));
  const skills = parseSkills(tree);
  console.log(`HAR: ${HAR_PATH}`);
  console.log(`entries: ${skills.length}`);
  console.log(`hasContent: ${sectionHasContent(tree, SECTION_MARKER_SUFFIXES.skills)}`);
  console.log(`totalCount: ${getSectionTotalCount(tree, SECTION_MARKER_SUFFIXES.skills)}`);
  console.log(JSON.stringify(skills, null, 2));
}
main();
