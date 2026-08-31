import { textLeaves } from './htmlUtils';

/**
 * One list entry from a `/details/{section}/` page.
 *
 * `leaves` is deliberately the SAME shape the Flight parsers already consume,
 * so the details path reuses their field-classification logic rather than
 * duplicating it.
 */
export interface DetailItem {
  leaves: string[];
  /** Per-role skills, when the page links them. */
  skills: string[];
}

/**
 * LinkedIn emits the SAME structural entry boundary in the details page's HTML
 * as it does in the Flight tree: `componentkey="entity-collection-item-…"`.
 *
 * That is what makes this path robust rather than a DOM-scraping exercise —
 * entries are delimited by LinkedIn's own component identity, not by CSS
 * classes (which are build-hashed and useless) or by element nesting.
 */
const ITEM_BOUNDARY = /componentkey="entity-collection-item-[^"]*"[^>]*>/g;

/**
 * Skills are linked to a skill-associations overlay. The href PATH is
 * semantic and stable, unlike every class name on the page, so it is a safe
 * marker — and a necessary one: a skills line such as
 * "Go (Programming Language) and ClickHouse" is indistinguishable from
 * description prose by content alone.
 */
const SKILL_LINK = /<a\b[^>]*href="[^"]*\/skill-associations-details\/?"[^>]*>([\s\S]*?)<\/a>/gi;

/**
 * Interface chrome appended after real entries. Ads are interleaved INTO the
 * list on details pages (six ad-chrome strings in the sp35 experience
 * capture), so an entry's leaves are cut at the first of these rather than
 * filtered line by line — everything after one is page furniture.
 */
const BLOCK_END_MARKERS = [
  'Ad Options',
  'Why am I seeing this ad',
  'People also viewed',
  'More profiles for you',
  'Explore Premium',
  'Explore collaborative articles',
];

const CHROME_LINES = [
  /^Skills:$/i,
  /^Show all/i,
  /^Show credential$/i,
  /^…$/,
  /^more$/i,
  /^Helped me get this job$/i,
  /^LinkedIn helped me get this job/i,
];

function stripSkillLinks(blockHtml: string): { html: string; skills: string[] } {
  const skills: string[] = [];
  const html = blockHtml.replace(SKILL_LINK, (_whole, inner: string) => {
    for (const leaf of textLeaves(inner)) {
      // The overlay link also contains an icon label; keep only the list.
      if (leaf.length > 1 && !/^Skills:?$/i.test(leaf)) skills.push(leaf);
    }
    return ' ';
  });
  return { html, skills };
}

/**
 * Splits a `/details/{section}/` page into per-entry leaf lists.
 *
 * Section-agnostic on purpose: every details page uses the same entry
 * boundary, so Education, Certifications and the rest reuse this untouched.
 */
export function extractDetailItems(html: string): DetailItem[] {
  const boundaries: number[] = [];
  ITEM_BOUNDARY.lastIndex = 0;
  for (let m = ITEM_BOUNDARY.exec(html); m !== null; m = ITEM_BOUNDARY.exec(html)) {
    boundaries.push(m.index + m[0].length);
  }

  const items: DetailItem[] = [];
  boundaries.forEach((start, i) => {
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : html.length;
    const { html: withoutSkills, skills } = stripSkillLinks(html.slice(start, end));

    let leaves = textLeaves(withoutSkills);

    // Cut at page furniture rather than filtering it line by line: everything
    // after an ad or a recommendation rail belongs to the page, not the entry.
    const cutAt = leaves.findIndex((l) => BLOCK_END_MARKERS.some((m) => l.startsWith(m)));
    if (cutAt !== -1) leaves = leaves.slice(0, cutAt);

    leaves = leaves.filter((l) => !CHROME_LINES.some((p) => p.test(l)));

    if (leaves.length > 0) items.push({ leaves, skills });
  });

  return items;
}
