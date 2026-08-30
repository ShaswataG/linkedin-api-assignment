import { decodeFlightResponse } from '../../src/linkedin/flightDecoder';
import { getSectionTotalCount, SECTION_MARKER_SUFFIXES } from '../../src/linkedin/sectionDispatcher';
import { parseEducation } from '../../src/linkedin/parsers/educationParser';
import { loadCardFromHar, PART1_WITHOUT_EXP } from './loadCardFromHar';

// Regression fixture: profile `shaswata-gogoi`, whose second education entry
// has NO date range ("Shrimanta Shankar Academy, Guwahati" / "Senior
// Secondary"). That exercises the `recoverTrailingDatelessEntry` path — the
// same path CLAUDE.md's padamkataria known-good covers, but reproducible
// offline, since no captured HAR holds padamkataria's Part1WithoutExp card.
const HAR_PATH = process.argv[2] ?? 'har_collection/arpitbhayani_full_profile.har';

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
