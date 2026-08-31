import { decodeFlightResponse } from '../../src/linkedin/flightDecoder';
import { parseExperience } from '../../src/linkedin/parsers/experienceParser';
import { loadCardFromHar } from './loadCardFromHar';

const HAR_PATH = process.argv[2] ?? 'har_collection/barry-a-6410b4432_full_profile.har';

function main() {
  const raw = loadCardFromHar(HAR_PATH, 'profileCardsExperienceOnly');
  const tree = decodeFlightResponse(raw);

  const warnings: string[] = [];
  const entries = parseExperience(tree, warnings);

  console.log(`HAR: ${HAR_PATH}`);
  console.log(`entries: ${entries.length}`);
  console.log(`warnings: ${warnings.length}`);
  warnings.forEach((w) => console.log(`  ! ${w}`));
  console.log(JSON.stringify(entries, null, 2));
}

main();
