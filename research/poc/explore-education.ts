import { decodeFlightResponse } from '../../src/linkedin/flightDecoder';
import { fetchProfileCard } from '../../src/linkedin/client';
import { parseEducation } from '../../src/linkedin/parsers/educationParser';
 
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
  const education = parseEducation(tree);
 
  console.log(JSON.stringify(education, null, 2));
}
 
main().catch((err) => {
  console.error(err);
  process.exit(1);
});