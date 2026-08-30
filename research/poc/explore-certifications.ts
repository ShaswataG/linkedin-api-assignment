import { decodeFlightResponse, extractOrderedTextLeaves } from '../../src/linkedin/flightDecoder';
import {
  findSectionSubtree,
  findEntityCollectionItems,
  getSectionTotalCount,
  sectionHasContent,
  SECTION_MARKER_SUFFIXES,
} from '../../src/linkedin/sectionDispatcher';
import { parseCertifications } from '../../src/linkedin/parsers/certificationsParser';
import { loadCardFromHar, PART1_WITHOUT_EXP } from './loadCardFromHar';

const HAR_PATH = process.argv[2] ?? 'har_collection/s_full_profile.har';

function main() {
  const raw = loadCardFromHar(HAR_PATH, PART1_WITHOUT_EXP);
  const tree = decodeFlightResponse(raw);
  const marker = SECTION_MARKER_SUFFIXES.certifications;

  const subtree = findSectionSubtree(tree, marker);
  const leaves = subtree ? extractOrderedTextLeaves(subtree) : [];

  const parsed = parseCertifications(tree);

  console.log(`HAR: ${HAR_PATH}`);
  console.log(`entries: ${parsed.length}`);
  console.log(`hasContent: ${sectionHasContent(tree, marker)}`);
  console.log(`totalCount: ${getSectionTotalCount(tree, marker)}`);
  // Verified, not assumed: certifications use ephemeral per-render
  // componentkeys, so the entity-collection-item boundary trick does NOT
  // apply here (same as Education). Printed so a future change is noticed.
  console.log(`entityCollectionItems: ${subtree ? findEntityCollectionItems(subtree).length : 0}`);

  console.log('\nleaves:');
  leaves.forEach((leaf, i) => console.log(`  ${String(i).padStart(3)} | ${leaf}`));

  console.log('\nparsed:');
  console.log(JSON.stringify(parsed, null, 2));
}

main();
