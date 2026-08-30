import { decodeFlightResponse, extractOrderedTextLeaves } from '../../src/linkedin/flightDecoder';
import { fetchProfileCard } from '../../src/linkedin/client';
import { segmentFixedFieldEntries } from '../../src/linkedin/parsers/genericEntryParser';

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
  const leaves = extractOrderedTextLeaves(tree);
  leaves.forEach((text, i) => {
    console.log(`${i}: "${text}"`);
  });
  console.log('leaf count:', leaves.length);
  console.log('lengths:', leaves.map((l) => l.length));

  console.log(segmentFixedFieldEntries(leaves, 2)); // Education attempt
  console.log(segmentFixedFieldEntries(leaves, 1)); // Projects attempt
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});