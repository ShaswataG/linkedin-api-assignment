import { findSectionSubtree, SECTION_MARKER_SUFFIXES } from '../sectionDispatcher';
import { extractOrderedTextLeaves } from '../flightDecoder';

const INVISIBLE_CHARS = /[​-‏﻿]/g;

export function parseAbout(cardTree: unknown): string | undefined {
  const subtree = findSectionSubtree(cardTree, SECTION_MARKER_SUFFIXES.about);
  if (!subtree) return undefined;

  const leaves = extractOrderedTextLeaves(subtree)
    .map((leaf) =>
      leaf
        .replace(INVISIBLE_CHARS, '')
        // LinkedIn embeds hard line breaks inside a single leaf.
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean);

  const paragraphs = leaves[0] === 'About' ? leaves.slice(1) : leaves;
  if (paragraphs.length === 0) return undefined;

  return paragraphs.join('\n\n');
}
