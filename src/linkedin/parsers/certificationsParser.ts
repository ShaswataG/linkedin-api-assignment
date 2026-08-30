import { findSectionSubtree, SECTION_MARKER_SUFFIXES } from '../sectionDispatcher';
import { extractOrderedTextLeaves } from '../flightDecoder';
import { splitMiddotField } from '../fieldUtils';
import { segmentFixedFieldEntries } from './genericEntryParser';

export interface CertificationEntry {
  name: string;
  issuer?: string;
  issuedDate?: string;
  expirationDate?: string;
  credentialId?: string;
}

const CERTIFICATION_ANCHOR_PATTERN = /^(Issued|Expires)\b/;

const CREDENTIAL_ID_PREFIX = /^Credential ID\s*/;

export function parseCertifications(cardTree: unknown): CertificationEntry[] {
  const subtree = findSectionSubtree(cardTree, SECTION_MARKER_SUFFIXES.certifications);
  if (!subtree) return [];

  const leaves = extractOrderedTextLeaves(subtree);
  const withoutHeader = /^Licenses & certifications/.test(leaves[0] ?? '')
    ? leaves.slice(1)
    : leaves;

  const entries = segmentFixedFieldEntries(withoutHeader, 2, {
    isAnchor: (s) => CERTIFICATION_ANCHOR_PATTERN.test(s),
  });

  return entries.map((e) => {
    const { primary, secondary } = splitMiddotField(e.dateRange);
    const dateParts = secondary ? [primary, secondary] : [primary];

    let issuedDate: string | undefined;
    let expirationDate: string | undefined;
    for (const part of dateParts) {
      if (part.startsWith('Issued')) issuedDate = part.replace(/^Issued\s*/, '').trim() || undefined;
      else if (part.startsWith('Expires')) {
        expirationDate = part.replace(/^Expires\s*/, '').trim() || undefined;
      }
    }

    const credentialLeaf = e.extras.find((x) => CREDENTIAL_ID_PREFIX.test(x));

    return {
      name: e.fields[0] ?? '',
      issuer: e.fields[1],
      issuedDate,
      expirationDate,
      credentialId: credentialLeaf?.replace(CREDENTIAL_ID_PREFIX, '').trim() || undefined,
    };
  });
}
