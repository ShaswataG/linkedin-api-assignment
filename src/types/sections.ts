export const SECTION_KEYS = [
  'about',
  'experience',
  'education',
  'skills',
  'certifications',
  'volunteer',
  'projects',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export function isSectionKey(value: string): value is SectionKey {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

export interface SectionDefinition<T = unknown> {
  key: SectionKey;
  cardId: string;
  marker: string;
  parse(tree: unknown, warnings: string[]): T[];
  detailsPath?: string;
  detailsParser?: (html: string, warnings: string[]) => T[];
}
