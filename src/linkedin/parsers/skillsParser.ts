import { findSectionSubtree, findComponentItems, SECTION_MARKER_SUFFIXES } from '../sectionDispatcher';
import { extractOrderedTextLeaves } from '../flightDecoder';

export interface SkillEntry {
  name: string;
  endorsementCount?: number;
  endorsedBy?: string[];
  demonstratedIn?: string[];
}

const SKILL_ITEM_PATTERN = /^com\.linkedin\.sdui\.profile\.skill[(.]/;

const ENDORSEMENT_COUNT = /^(\d+)\s+endorsements?$/i;
const ENDORSED_BY = /^Endorsed by\b/i;

export function parseSkills(cardTree: unknown): SkillEntry[] {
  const subtree = findSectionSubtree(cardTree, SECTION_MARKER_SUFFIXES.skills);
  if (!subtree) return [];

  const entries: SkillEntry[] = [];

  for (const item of findComponentItems(subtree, SKILL_ITEM_PATTERN)) {
    const leaves = extractOrderedTextLeaves(item)
      .map((l) => l.replace(/[​-‏﻿]/g, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    if (leaves.length === 0) continue;

    const [name, ...context] = leaves;

    const countLine = context.find((c) => ENDORSEMENT_COUNT.test(c));
    const endorsedBy = context.filter((c) => ENDORSED_BY.test(c));
    const demonstratedIn = context.filter((c) => !ENDORSEMENT_COUNT.test(c) && !ENDORSED_BY.test(c));

    entries.push({
      name,
      endorsementCount: countLine ? Number(countLine.match(ENDORSEMENT_COUNT)![1]) : undefined,
      endorsedBy: endorsedBy.length > 0 ? endorsedBy : undefined,
      demonstratedIn: demonstratedIn.length > 0 ? demonstratedIn : undefined,
    });
  }

  return entries;
}
