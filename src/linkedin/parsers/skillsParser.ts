import { findSectionSubtree, findComponentItems, SECTION_MARKER_SUFFIXES } from '../sectionDispatcher';
import { decodeFlightResponse, extractOrderedTextLeaves } from '../flightDecoder';

export interface SkillEntry {
  name: string;
  endorsementCount?: number;
  endorsedBy?: string[];
  demonstratedIn?: string[];
}

const SKILL_ITEM_PATTERN = /^com\.linkedin\.sdui\.profile\.skill[(.]/;

const ENDORSEMENT_COUNT = /^(\d+)\s+endorsements?$/i;
const ENDORSED_BY = /^Endorsed by\b/i;

function buildSkillEntry(rawLeaves: string[]): SkillEntry | null {
  const leaves = rawLeaves
    .map((l) => l.replace(/[​-‏﻿]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (leaves.length === 0) return null;

  const [name, ...context] = leaves;
  const countLine = context.find((c) => ENDORSEMENT_COUNT.test(c));
  const endorsedBy = context.filter((c) => ENDORSED_BY.test(c));
  const demonstratedIn = context.filter((c) => !ENDORSEMENT_COUNT.test(c) && !ENDORSED_BY.test(c));

  return {
    name,
    endorsementCount: countLine ? Number(countLine.match(ENDORSEMENT_COUNT)![1]) : undefined,
    endorsedBy: endorsedBy.length > 0 ? endorsedBy : undefined,
    demonstratedIn: demonstratedIn.length > 0 ? demonstratedIn : undefined,
  };
}

export function parseSkills(cardTree: unknown): SkillEntry[] {
  const subtree = findSectionSubtree(cardTree, SECTION_MARKER_SUFFIXES.skills);
  if (!subtree) return [];

  const entries: SkillEntry[] = [];

  for (const item of findComponentItems(subtree, SKILL_ITEM_PATTERN)) {
    const entry = buildSkillEntry(extractOrderedTextLeaves(item));
    if (entry) entries.push(entry);
  }
  return entries;
}

export function parseSkillsDetails(flightText: string, warnings: string[] = []): SkillEntry[] {
  let tree: unknown;
  try {
    tree = decodeFlightResponse(flightText);
  } catch (err) {
    warnings.push(`skills: could not decode the details response (${String(err)})`);
    return [];
  }

  const entries: SkillEntry[] = [];
  for (const item of findComponentItems(tree, SKILL_ITEM_PATTERN)) {
    const entry = buildSkillEntry(extractOrderedTextLeaves(item));
    if (entry) entries.push(entry);
  }
  return entries;
}
