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
        /** Referer path LinkedIn expects for this pager's screen. */
        refererPath: string;
        /**
         * `x-li-anchor-page-key` for this screen, e.g.
         * `d_flagship3_profile_view_base_skills_details`.
         *
         * LinkedIn's own client sends this (plus `x-li-rsc-stream: true`) on
         * every pagination request. Take the value from a captured request —
         * the naming pattern is regular but has not been verified for every
         * section.
         */
        anchorPageKey: string;
        /**
         * Payload fields this pager needs BEYOND the common
         * vanityName/profileId/start/count.
         *
         * The shape is per-pager, NOT universal: Education requires
         * `detailSectionReplaceableComponentRef`; Skills instead requires
         * `filter: 'ProfileSkillCategory_ALL'` and does not use a section ref
         * at all. Copying one pager's shape onto another silently broke
         * skills paging — verify each against a captured request.
         */
        payloadExtras?: (profileId: string) => Record<string, unknown>;
      };
  /** Parses the full list out of whichever response `details` describes. */
  detailsParser?: (body: string, warnings: string[]) => T[];
}
