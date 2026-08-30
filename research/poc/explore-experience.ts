import { decodeFlightResponse, extractOrderedTextLeaves } from '../../src/linkedin/flightDecoder';
import { fetchProfileCard } from '../../src/linkedin/client';
import { segmentExperienceLeaves } from '../../src/linkedin/parsers/experienceParser';

const profileId = '';

async function main() {
  const session = {
    cookie: 'li_at=...; JSESSIONID="ajax:..."', // paste your real session values
    csrfToken: 'ajax:...', // must match JSESSIONID
  };

  const raw = await fetchProfileCard(
    profileId, // use a profile you already have known-good expected output for
    'com.linkedin.sdui.generated.profile.dsl.impl.profileCardsExperienceOnly',
    session,
  );

  const tree = decodeFlightResponse(raw);
  const leaves = extractOrderedTextLeaves(tree);
  const entries = segmentExperienceLeaves(leaves);

  console.log(JSON.stringify(entries, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});