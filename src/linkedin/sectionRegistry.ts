import { SectionDefinition } from '../types/sections';
import { SECTION_MARKER_SUFFIXES } from './sectionDispatcher';
import { parseCertifications } from './parsers/certificationsParser';
import { parseEducation } from './parsers/educationParser';
import { parseExperience, parseExperienceDetails } from './parsers/experienceParser';
import { parseProjects } from './parsers/projectParser';
import { parseSkills } from './parsers/skillsParser';
import { parseVolunteer } from './parsers/volunteerParser';

const PREFIX = 'com.linkedin.sdui.generated.profile.dsl.impl.';

export const CARD_IDS = {
  aboveActivity: `${PREFIX}profileCardsAboveActivity`,
  experienceOnly: `${PREFIX}profileCardsExperienceOnly`,
  belowActivityPart1: `${PREFIX}profileCardsBelowActivityPart1WithoutExp`,
  belowActivityPart7: `${PREFIX}profileCardsBelowActivityPart7`,
} as const;

export const SECTION_REGISTRY: SectionDefinition<any>[] = [
  {
    key: 'experience',
    cardId: CARD_IDS.experienceOnly,
    marker: 'ExperienceTopLevel',
    parse: (tree, warnings) => parseExperience(tree, warnings),
    detailsPath: 'details/experience/',
    detailsParser: (html, warnings) => parseExperienceDetails(html, warnings),
  },
  {
    key: 'education',
    cardId: CARD_IDS.belowActivityPart1,
    marker: SECTION_MARKER_SUFFIXES.education,
    parse: (tree) => parseEducation(tree),
    detailsPath: 'details/education/',
  },
  {
    key: 'certifications',
    cardId: CARD_IDS.belowActivityPart1,
    marker: SECTION_MARKER_SUFFIXES.certifications,
    parse: (tree) => parseCertifications(tree),
    detailsPath: 'details/certifications/',
  },
  {
    key: 'volunteer',
    cardId: CARD_IDS.belowActivityPart1,
    marker: SECTION_MARKER_SUFFIXES.volunteer,
    parse: (tree) => parseVolunteer(tree),
    detailsPath: 'details/volunteering/',
  },
  {
    key: 'projects',
    cardId: CARD_IDS.belowActivityPart1,
    marker: SECTION_MARKER_SUFFIXES.projects,
    parse: (tree) => parseProjects(tree),
    detailsPath: 'details/projects/',
  },
  {
    key: 'skills',
    cardId: CARD_IDS.belowActivityPart7,
    marker: SECTION_MARKER_SUFFIXES.skills,
    parse: (tree) => parseSkills(tree),
    detailsPath: 'details/skills/',
  },
];

export function cardsFor(sections: SectionDefinition[]): string[] {
  return [...new Set(sections.map((s) => s.cardId))];
}
