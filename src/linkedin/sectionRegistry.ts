import { SectionDefinition } from '../types/sections';
import { SECTION_MARKER_SUFFIXES } from './sectionDispatcher';
import { parseCertifications } from './parsers/certificationsParser';
import { parseEducation, parseEducationDetails } from './parsers/educationParser';
import { parseExperience, parseExperienceDetails } from './parsers/experienceParser';
import { parseProjects } from './parsers/projectParser';
import { parseSkills, parseSkillsDetails } from './parsers/skillsParser';
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
    details: { kind: 'html', path: 'details/experience/' },
    detailsParser: (html, warnings) => parseExperienceDetails(html, warnings),
  },
  {
    key: 'education',
    cardId: CARD_IDS.belowActivityPart1,
    marker: SECTION_MARKER_SUFFIXES.education,
    parse: (tree) => parseEducation(tree),
    details: {
      kind: 'pagination',
      pagerId: 'com.linkedin.sdui.pagers.profile.details.education',
      screenId: 'com.linkedin.sdui.flagshipnav.profile.ProfileEducationDetails',
      sectionRefSuffix: 'EducationDetailsSection',
      refererPath: 'details/education/',
    },
    detailsParser: (body, warnings) => parseEducationDetails(body, warnings),
  },
  {
    key: 'certifications',
    cardId: CARD_IDS.belowActivityPart1,
    marker: SECTION_MARKER_SUFFIXES.certifications,
    parse: (tree) => parseCertifications(tree),
    details: { kind: 'html', path: 'details/certifications/' },
  },
  {
    key: 'volunteer',
    cardId: CARD_IDS.belowActivityPart1,
    marker: SECTION_MARKER_SUFFIXES.volunteer,
    parse: (tree) => parseVolunteer(tree),
    details: { kind: 'html', path: 'details/volunteering/' },
  },
  {
    key: 'projects',
    cardId: CARD_IDS.belowActivityPart1,
    marker: SECTION_MARKER_SUFFIXES.projects,
    parse: (tree) => parseProjects(tree),
    details: { kind: 'html', path: 'details/projects/' },
  },
  {
    key: 'skills',
    cardId: CARD_IDS.belowActivityPart7,
    marker: SECTION_MARKER_SUFFIXES.skills,
    parse: (tree) => parseSkills(tree),
    details: {
      kind: 'pagination',
      pagerId: 'com.linkedin.sdui.pagers.profile.details.skills',
      screenId: 'com.linkedin.sdui.flagshipnav.profile.ProfileSkillsDetails',
      sectionRefSuffix: 'SkillsDetailsSection',
      refererPath: 'details/skills/',
    },
    detailsParser: (body, warnings) => parseSkillsDetails(body, warnings),
  },
];

export function cardsFor(sections: SectionDefinition[]): string[] {
  return [...new Set(sections.map((s) => s.cardId))];
}

export function cardServesOneSection(cardId: string): boolean {
  return SECTION_REGISTRY.filter((s) => s.cardId === cardId).length === 1;
}
