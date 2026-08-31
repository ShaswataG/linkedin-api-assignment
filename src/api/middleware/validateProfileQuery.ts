import { BadRequestError } from '../errors';
import { SECTION_KEYS, SectionKey, isSectionKey } from '../../types/sections';

export function parseVanityName(
  rawUrl: unknown,
  options: { allowBareVanity?: boolean } = {},
): string {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new BadRequestError('Query parameter "url" is required.');
  }

  const value = rawUrl.trim();

  const match = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([^/?#]+)/i.exec(value);
  if (match) return decodeURIComponent(match[1]);

  if (
    options.allowBareVanity &&
    /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{1,98}[a-zA-Z0-9])?$/.test(value)
  ) {
    return value;
  }

  throw new BadRequestError(
    `Could not read a profile from "${value}". Expected a URL like ` +
      'https://www.linkedin.com/in/example',
  );
}

/** Parses `?expand=a,b` or `?expand=all`. Unknown values are rejected, not ignored. */
export function parseExpand(rawExpand: unknown): SectionKey[] {
  if (rawExpand === undefined) return [];
  if (typeof rawExpand !== 'string') {
    throw new BadRequestError('Query parameter "expand" must be a comma-separated string.');
  }

  const requested = rawExpand.split(',').map((s) => s.trim()).filter(Boolean);
  if (requested.length === 1 && requested[0] === 'all') return [...SECTION_KEYS];

  const unknown = requested.filter((s) => !isSectionKey(s));
  if (unknown.length > 0) {
    throw new BadRequestError(
      `Unknown expand value(s): ${unknown.join(', ')}. Valid: ${SECTION_KEYS.join(', ')}, all.`,
    );
  }
  return requested as SectionKey[];
}

export function parseBooleanFlag(raw: unknown, name: string): boolean {
  if (raw === undefined) return false;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new BadRequestError(`Query parameter "${name}" must be true or false.`);
}
