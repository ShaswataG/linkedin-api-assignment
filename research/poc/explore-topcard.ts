import { parseTopcard } from '../../src/linkedin/parsers/topcardParser';
import { loadDocumentFromHar } from './loadCardFromHar';

const HAR_PATH = process.argv[2] ?? 'har_collection/arpitbhayani_doc_filter.har';

function main() {
  const warnings: string[] = [];
  const topcard = parseTopcard(loadDocumentFromHar(HAR_PATH), warnings);
  console.log(`HAR: ${HAR_PATH}`);
  console.log(`warnings: ${warnings.length}`);
  warnings.forEach((w) => console.log(`  ! ${w}`));
  console.log(JSON.stringify(topcard, null, 2));
}
main();
