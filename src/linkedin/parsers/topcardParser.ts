import {
  decodeEntities,
  firstElementContent,
  fromElement,
  largestFromSrcSet,
  textLeaves,
} from '../htmlUtils';

export interface Topcard {
  name?: string;
  pronouns?: string;
  headline?: string;
  location?: string;
  /** "Attack Capital · Jorhat Engineering College" — current company and school. */
  currentAffiliations?: string[];
  profileImageUrl?: string;
  bannerImageUrl?: string;
}

const PRONOUN_PATTERN = /^[A-Za-z]{2,12}\/[A-Za-z]{2,12}$/;

const BARE_SEPARATOR = /^[·•|]$/;

const CONTACT_INFO = 'Contact info';

function preloadedImage(headHtml: string, kind: string): string | undefined {
  for (const match of headHtml.matchAll(/imageSrcSet="([^"]+)"/g)) {
    if (match[1].includes(kind)) return largestFromSrcSet(match[1]);
  }
  // Fall back to any direct URL of that kind anywhere in the document.
  const direct = new RegExp(`https://media\\.licdn\\.com/[^"'\\s]*${kind}[^"'\\s]*`).exec(headHtml);
  return direct ? decodeEntities(direct[0]) : undefined;
}

export function parseTopcard(documentHtml: string, warnings: string[] = []): Topcard {
  const head = firstElementContent(documentHtml, 'head') ?? documentHtml.slice(0, 20000);

  const rawTitle = firstElementContent(documentHtml, 'title');
  const name = rawTitle
    ? decodeEntities(rawTitle).replace(/\s*\|\s*LinkedIn\s*$/i, '').trim() || undefined
    : undefined;
  if (!name) warnings.push('topcard: could not read name from <title>');

  const profileImageUrl = preloadedImage(head, 'profile-displayphoto');
  const bannerImageUrl = preloadedImage(head, 'profile-displaybackgroundimage');

  const main = fromElement(documentHtml, 'main');
  if (!main) {
    warnings.push('topcard: no <main> element; only name and images available');
    return { name, profileImageUrl, bannerImageUrl };
  }

  const leaves = textLeaves(main.slice(0, 20000));

  const contactIndex = leaves.indexOf(CONTACT_INFO);
  if (contactIndex === -1) {
    warnings.push('topcard: no "Contact info" anchor; headline and location not extracted');
    return { name, profileImageUrl, bannerImageUrl };
  }

  let locationIndex = contactIndex - 1;
  while (locationIndex >= 0 && BARE_SEPARATOR.test(leaves[locationIndex])) locationIndex -= 1;
  const location = locationIndex >= 0 ? leaves[locationIndex] : undefined;

  const linkedEntities = new Set(leaves.slice(contactIndex + 1, contactIndex + 12));
  const isAffiliationsLine = (leaf: string): boolean => {
    const parts = leaf.split('·').map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 && parts.every((p) => linkedEntities.has(p));
  };

  const candidates = leaves.slice(1, Math.max(1, locationIndex));
  const pronouns = candidates.find((c) => PRONOUN_PATTERN.test(c));
  const affiliationsLine = candidates.find(isAffiliationsLine);
  const headline = candidates.find(
    (c) =>
      c !== pronouns &&
      c !== affiliationsLine &&
      c !== name &&
      !BARE_SEPARATOR.test(c) &&
      !isAffiliationsLine(c),
  );

  if (name && leaves[0] && leaves[0] !== name) {
    warnings.push(`topcard: <title> name "${name}" does not match first heading "${leaves[0]}"`);
  }

  return {
    name,
    pronouns,
    headline,
    location,
    currentAffiliations: affiliationsLine
      ? affiliationsLine.split('·').map((p) => p.trim()).filter(Boolean)
      : undefined,
    profileImageUrl,
    bannerImageUrl,
  };
}
