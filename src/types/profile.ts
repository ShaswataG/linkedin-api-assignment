import { CertificationEntry } from '../linkedin/parsers/certificationsParser';
import { EducationEntry } from '../linkedin/parsers/educationParser';
import { ProjectEntry } from '../linkedin/parsers/projectParser';
import { SkillEntry } from '../linkedin/parsers/skillsParser';
import { VolunteerEntry } from '../linkedin/parsers/volunteerParser';

export interface Position {
  title: string;
  employmentType?: string;
  startDate: string;
  endDate: string;
  duration?: string;
  location?: string;
  locationType?: string;
  description?: string;
}

export interface ExperienceEntry {
  companyName: string;
  employmentType?: string;
  totalDuration?: string;
  location?: string;
  locationType?: string;
  skills?: string[];
  unnamedSkillCount?: number;
  positions: Position[];
}

export interface SectionEnvelope<T> {
  items: T[];
  totalCount?: number;
  truncated: boolean;
}

export interface ProfileData {
  profileUrl: string;
  vanityName: string;

  name?: string;
  headline?: string;
  location?: string;
  pronouns?: string;
  profileImageUrl?: string;
  bannerImageUrl?: string;
  about?: string;
  experience: SectionEnvelope<ExperienceEntry>;
  education: SectionEnvelope<EducationEntry>;
  skills: SectionEnvelope<SkillEntry>;
  certifications: SectionEnvelope<CertificationEntry>;
  volunteer: SectionEnvelope<VolunteerEntry>;
  projects: SectionEnvelope<ProjectEntry>;
  extractionWarnings: string[];
  fetchedAt: string;
  cached: boolean;
}
