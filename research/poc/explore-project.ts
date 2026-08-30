import { decodeFlightResponse } from '../../src/linkedin/flightDecoder';
import { fetchProfileCard } from '../../src/linkedin/client';
import { parseProjects } from '../../src/linkedin/parsers/projectParser';

const profileId = '';

async function main() {
  const session = {
    cookie: 'li_at=...; JSESSIONID="ajax:..."',
    csrfToken: 'ajax:...',
  };

  const raw = await fetchProfileCard(
    profileId,
    'com.linkedin.sdui.generated.profile.dsl.impl.profileCardsBelowActivityPart1WithoutExp',
    session,
  );

  const tree = decodeFlightResponse(raw);
  const projects = parseProjects(tree);

  console.log(JSON.stringify(projects, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});