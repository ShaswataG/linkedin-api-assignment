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
  details?:
    | { kind: 'html'; path: string }
    | {
        kind: 'pagination';
        pagerId: string;
        screenId: string;
        sectionRefSuffix: string;
        refererPath: string;
      };
  detailsParser?: (body: string, warnings: string[]) => T[];
}
