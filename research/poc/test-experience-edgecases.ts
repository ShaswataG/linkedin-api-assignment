/**
 * Edge-case suite for the Experience parser.
 *
 * Two halves:
 *  1. Every captured profile that has an Experience card — checks the parser
 *     against real, varied data rather than one profile it was tuned on.
 *  2. Synthetic leaf lists exercising each optional field's ABSENCE. These
 *     bypass the HAR layer and drive the item parsers directly, which is the
 *     only way to cover shapes no captured profile happens to contain.
 *
 * Run: npx ts-node research/poc/test-experience-edgecases.ts
 */
import { existsSync } from 'fs';
import { decodeFlightResponse } from '../../src/linkedin/flightDecoder';
import { parseExperience } from '../../src/linkedin/parsers/experienceParser';
import { loadCardFromHar } from './loadCardFromHar';

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------- real HARs

const REAL_PROFILES = [
  'har_collection/sp35.har',
  'har_collection/sp35_full_profile.har',
  'har_collection/shaswata-gogoi_full_profile.har',
  'har_collection/chandrama-gogoi_full_profile.har',
  'har_collection/padamkataria.har',
  'har_collection/padamkataria_full_profile.har',
  'har_collection/kunal-kabra-5039bb54.har',
  'har_collection/mubansal.har',
];

console.log('=== real captured profiles ===');
for (const har of REAL_PROFILES) {
  if (!existsSync(har)) {
    console.log(`  SKIP  ${har} (not present)`);
    continue;
  }

  let entries;
  const warnings: string[] = [];
  try {
    entries = parseExperience(decodeFlightResponse(loadCardFromHar(har, 'profileCardsExperienceOnly')), warnings);
  } catch (err) {
    // A HAR captured with a narrower DevTools filter simply may not contain
    // the Experience card. That is a capture gap, not a parser failure —
    // distinguish the two so the suite stays meaningful across ad-hoc
    // captures taken with different filters.
    if (String(err).includes('No 200 POST response for componentId')) {
      console.log(`  SKIP  ${har} (no profileCardsExperienceOnly in this capture)`);
    } else {
      check(`${har} parses`, false, String(err));
    }
    continue;
  }

  console.log(`\n  ${har} -> ${entries.length} entries, ${warnings.length} warnings`);
  warnings.forEach((w) => console.log(`        ! ${w}`));

  // Invariants that must hold for EVERY profile, regardless of shape.
  check(
    `${har}: every entry has a company name`,
    entries.every((e) => e.companyName.trim().length > 0),
    JSON.stringify(entries.filter((e) => !e.companyName.trim()).map((e) => e.positions?.[0]?.title)),
  );
  check(
    `${har}: no company name is an employment type`,
    entries.every((e) => !/^(Full-time|Part-time|Internship|Contract|Freelance|Self-employed)$/.test(e.companyName)),
    JSON.stringify(entries.map((e) => e.companyName)),
  );
  check(
    `${har}: every entry has >=1 position`,
    entries.every((e) => e.positions.length > 0),
  );
  check(
    `${har}: every position has a title`,
    entries.every((e) => e.positions.every((p) => p.title.trim().length > 0)),
  );
  // A title that is a description bullet means role boundaries drifted.
  check(
    `${har}: no position title looks like a description bullet`,
    entries.every((e) => e.positions.every((p) => !/^[•◦●\-•]/.test(p.title) && p.title.length < 120)),
    JSON.stringify(entries.flatMap((e) => e.positions.map((p) => p.title)).filter((t) => /^[•◦●\-•]/.test(t))),
  );
  // Every date that exists in the item must end up on a position, not buried
  // in a description — the symptom of a missing role.
  check(
    `${har}: no description contains an un-extracted date range`,
    entries.every((e) =>
      e.positions.every((p) => !/^[A-Z][a-z]{2} \d{4} - (Present|[A-Z][a-z]{2} \d{4})/.test((p.description ?? '').trim())),
    ),
  );
  entries.forEach((e) =>
    e.positions.forEach((p) => {
      if (p.description) {
        check(
          `${har}: description of "${p.title}" carries no stray CR/LF`,
          !/[\r\n]/.test(p.description),
        );
      }
    }),
  );
}

// ------------------------------------------------------- synthetic absences

/**
 * Wraps a leaf list in the minimum structure parseExperience needs: one
 * `entity-collection-item-` componentkey per entry, with each leaf under a
 * `children` key so extractOrderedTextLeaves finds it in order.
 */
function fakeCard(items: string[][]): unknown {
  return items.map((leaves, n) => ({
    componentkey: `entity-collection-item-${n}`,
    children: leaves.map((leaf) => ({ children: leaf })),
  }));
}

function parse(items: string[][]) {
  const warnings: string[] = [];
  return { entries: parseExperience(fakeCard(items), warnings), warnings };
}

console.log('\n=== synthetic edge cases (missing optional fields) ===');

// Sanity: the harness itself reproduces the known real shapes.
{
  const { entries } = parse([['Houseware', '3 yrs 3 mos', 'Founding Engineer', 'May 2022 - Jan 2025 · 2 yrs 9 mos', 'Backend Engineering Intern', 'Nov 2021 - Apr 2022 · 6 mos']]);
  check('harness reproduces grouped/no-location/no-empType', entries[0].companyName === 'Houseware' && entries[0].positions.length === 2);
}

// Flat: employment type absent (no middot on the company leaf).
{
  const { entries } = parse([['SDE', 'Outplayed.in', 'Nov 2024 - Dec 2024 · 2 mos']]);
  check('flat: no employment type', entries[0].companyName === 'Outplayed.in' && entries[0].employmentType === undefined);
}

// Flat: location absent, description present (description must not be eaten as location).
{
  const { entries } = parse([['SDE', 'Acme · Internship', 'Nov 2024 - Dec 2024 · 2 mos', 'Built a thing.']]);
  const p = entries[0].positions[0];
  check('flat: no location, description preserved', p.location === undefined && p.description === 'Built a thing.');
}

// Flat: no description at all.
{
  const { entries } = parse([['SDE', 'Acme · Internship', 'Nov 2024 - Dec 2024 · 2 mos']]);
  check('flat: no description -> undefined', entries[0].positions[0].description === undefined);
}

// Flat: NO DATE anywhere — must keep the company and warn, not crash or drop.
{
  const { entries, warnings } = parse([['Advisor', 'Acme · Part-time']]);
  check('flat: missing date keeps company', entries[0].companyName === 'Acme');
  check('flat: missing date warns', warnings.some((w) => w.includes('no date range')));
}

// Grouped: company-level location present (the shape that broke the old parser).
{
  const { entries } = parse([['Attack Capital', '8 mos', 'New York, United States · Remote', 'SDE', 'Full-time', 'Jun 2026 - Present · 3 mos']]);
  const e = entries[0];
  check('grouped: company location captured', e.location === 'New York, United States' && e.locationType === 'Remote');
  check('grouped: company name not lost', e.companyName === 'Attack Capital');
  check('grouped: employment type on the role', e.positions[0].employmentType === 'Full-time');
  check('grouped: title correct', e.positions[0].title === 'SDE');
}

// Grouped: company location absent but employment types present (Frint.in shape).
{
  const { entries } = parse([['Frint.in', '9 mos', 'SDE', 'Part-time', 'Mar 2025 - Jul 2025 · 5 mos', 'Remote', 'Full-stack Developer', 'Internship', 'Nov 2024 - Mar 2025 · 5 mos', 'Remote']]);
  const e = entries[0];
  check('grouped: no company location', e.location === undefined && e.companyName === 'Frint.in');
  check('grouped: two roles found', e.positions.length === 2);
  // A bare work arrangement is a locationType with no place, not a location.
  check(
    'grouped: bare "Remote" read as locationType, not description',
    e.positions[0].locationType === 'Remote' && e.positions[0].location === undefined && !e.positions[0].description,
    JSON.stringify(e.positions[0]),
  );
  check('grouped: second role intact', e.positions[1].title === 'Full-stack Developer' && e.positions[1].employmentType === 'Internship');
}

// Grouped: mixed — one role has an employment type, the next does not.
{
  const { entries } = parse([['Acme', '2 yrs', 'Senior Dev', 'Full-time', 'Jan 2024 - Jan 2025 · 1 yr', 'Junior Dev', 'Jan 2023 - Jan 2024 · 1 yr']]);
  const e = entries[0];
  check('grouped: mixed empType presence', e.positions.length === 2 && e.positions[0].employmentType === 'Full-time' && e.positions[1].employmentType === undefined);
  check('grouped: mixed empType titles', e.positions[1].title === 'Junior Dev');
}

// Grouped: only ONE role under a company header.
{
  const { entries } = parse([['Acme', '1 yr', 'Engineer', 'Jan 2024 - Jan 2025 · 1 yr']]);
  check('grouped: single role', entries[0].positions.length === 1 && entries[0].companyName === 'Acme');
}

// Grouped: company location AND no employment types.
{
  const { entries } = parse([['Acme', '2 yrs', 'Berlin, Germany · Hybrid', 'Engineer', 'Jan 2024 - Jan 2025 · 1 yr']]);
  const e = entries[0];
  check('grouped: location without empType', e.location === 'Berlin, Germany' && e.positions[0].title === 'Engineer' && e.positions[0].employmentType === undefined);
}

// Grouped: trailing description overflow after the last role.
{
  const { entries } = parse([['Acme', '1 yr', 'Engineer', 'Jan 2024 - Jan 2025 · 1 yr', 'Did things.', 'Did more things.']]);
  check('grouped: trailing extras become description', entries[0].positions[0].description === 'Did things. Did more things.');
}

// Chrome and attachment filenames must never reach the output.
{
  const { entries } = parse([['SDE', 'Acme · Internship', 'Jan 2024 - Jan 2025 · 1 yr', 'LinkedIn helped me get this job', 'Real description.', 'Certificate', 'offer-letter.pdf']]);
  check('chrome filtered from description', entries[0].positions[0].description === 'Real description.', String(entries[0].positions[0].description));
}

// Hard line breaks inside one leaf must be collapsed.
{
  const { entries } = parse([['SDE', 'Acme · Internship', 'Jan 2024 - Jan 2025 · 1 yr', 'Line one\rline two']]);
  check('CR collapsed in description', entries[0].positions[0].description === 'Line one line two');
}

// Grouped header with employment type AND duration middot-bundled into one
// leaf (the shape that broke the "is leaf[1] a bare duration" classifier).
{
  const { entries } = parse([['GoTo Group', 'Full-time · 4 yrs 2 mos', 'Bengaluru, Karnataka, India · Hybrid', 'Engineering Manager', 'Apr 2026 - Present · 5 mos', 'Senior Software Engineer', 'Jul 2022 - Apr 2026 · 3 yrs 10 mos']]);
  const e = entries[0];
  check('grouped: middot-bundled empType+duration header', e.companyName === 'GoTo Group' && e.employmentType === 'Full-time' && e.totalDuration === '4 yrs 2 mos');
  check('grouped: both roles recovered', e.positions.length === 2 && e.positions[0].title === 'Engineering Manager' && e.positions[1].title === 'Senior Software Engineer');
  check('grouped: company location with arrangement', e.location === 'Bengaluru, Karnataka, India' && e.locationType === 'Hybrid');
}

// Header parts in the reverse order must parse identically (content, not position).
{
  const { entries } = parse([['Acme', '5 yrs · Contract', 'Engineer', 'Jan 2020 - Jan 2025 · 5 yrs']]);
  check('grouped: header part order irrelevant', entries[0].employmentType === 'Contract' && entries[0].totalDuration === '5 yrs');
}

// Long bullet descriptions between roles must not swallow the next role's title.
{
  const { entries } = parse([['Accenture', 'Full-time · 5 yrs', 'Greater Bengaluru Area',
    'Senior Software Engineer', 'Dec 2019 - Jul 2021 · 1 yr 8 mos',
    '● Involved in technical architecture discussions.', '● Configured CI/CD pipeline using Azure DevOps.', '● Implemented Single Sign On using Azure AD.',
    'Software Development Analyst', 'Dec 2017 - Nov 2019 · 2 yrs',
    '● Owned dev, stage and prod deployments.', '● Automated SharePoint processes using PowerShell scripts.',
    'Associate Software Engineer', 'Aug 2016 - Nov 2017 · 1 yr 4 mos', '● Developed custom SharePoint Web Parts.']]);
  const titles = entries[0].positions.map((p) => p.title);
  check('grouped: 3 roles across long descriptions', titles.length === 3, JSON.stringify(titles));
  check('grouped: titles not stolen from bullets', titles.join('|') === 'Senior Software Engineer|Software Development Analyst|Associate Software Engineer', JSON.stringify(titles));
  check('grouped: place without arrangement suffix', entries[0].location === 'Greater Bengaluru Area');
}

// A plain place (no work-arrangement suffix) after a flat entry's date.
{
  const { entries } = parse([['Associate', 'JPMorgan Chase & Co. · Full-time', 'Aug 2021 - Jul 2022 · 1 yr', 'Bengaluru, Karnataka, India', 'Did the work.']]);
  const p = entries[0].positions[0];
  check('flat: plain place read as location', p.location === 'Bengaluru, Karnataka, India' && p.description === 'Did the work.');
  check('flat: company/type split by content', entries[0].companyName === 'JPMorgan Chase & Co.' && entries[0].employmentType === 'Full-time');
}

// A description mentioning a date range must NOT be read as a role boundary.
{
  const { entries, warnings } = parse([['Engineer', 'Acme · Full-time', 'Jan 2020 - Jan 2025 · 5 yrs', 'Owned migrations from 2019 - 2021 across teams.']]);
  check('date inside prose is not a boundary', entries[0].positions.length === 1 && warnings.length === 0, JSON.stringify(warnings));
}

// Degenerate inputs must not throw.
{
  check('empty card -> no crash', parse([]).entries.length === 0);
  check('empty item -> skipped', parse([[]]).entries.length === 0);
  check('single-leaf item -> no crash', parse([['Just A Title']]).entries.length === 1);
}

// No entity-collection-items at all -> documented fallback path, not a crash.
{
  const warnings: string[] = [];
  const entries = parseExperience({ children: [{ children: 'Founding Engineer' }, { children: 'Tross' }, { children: 'Jun 2026 - Present · 3 mos' }] }, warnings);
  check('fallback path engages', warnings.some((w) => w.includes('fell back')) && entries.length === 1);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
