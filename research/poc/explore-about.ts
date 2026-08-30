import { decodeFlightResponse } from '../../src/linkedin/flightDecoder';
import { sectionHasContent, SECTION_MARKER_SUFFIXES } from '../../src/linkedin/sectionDispatcher';
import { parseAbout } from '../../src/linkedin/parsers/aboutParser';
import { loadCardFromHar } from './loadCardFromHar';

const HAR_PATH = process.argv[2] ?? 'har_collection/magdalena-nowodworska-59b4053aa_doc_filter.har';
const ABOUT_CARD = 'profileCardsAboveActivity';

function main() {
  const tree = decodeFlightResponse(loadCardFromHar(HAR_PATH, ABOUT_CARD));
  const about = parseAbout(tree);
  console.log(`HAR: ${HAR_PATH}`);
  console.log(`hasContent: ${sectionHasContent(tree, SECTION_MARKER_SUFFIXES.about)}`);
  console.log(`length: ${about?.length ?? 0}  paragraphs: ${about ? about.split('\n\n').length : 0}`);
  console.log('---');
  console.log(about ?? '(no About section)');
}
main();
