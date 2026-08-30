import { DATE_RANGE_PATTERN } from '../fieldUtils';

export interface GenericEntry {
  fields: string[]; // the N leading non-date fields, in order, meaning is section-specific
  dateRange: string;
  extras: string[];
}

export function segmentFixedFieldEntries(
  leaves: string[],
  leadingFieldCount: number,
  options: { recoverTrailingDatelessEntry?: boolean; isAnchor?: (s: string) => boolean } = {},
): GenericEntry[] {
  const entries: GenericEntry[] = [];
  let i = 0;


  const isDate = options.isAnchor ?? ((s: string) => DATE_RANGE_PATTERN.test(s));

  const isEntryStart = (idx: number) => {
    if (idx + leadingFieldCount >= leaves.length) return false;
    for (let f = 0; f < leadingFieldCount; f++) {
      if (isDate(leaves[idx + f])) return false;
    }
    return isDate(leaves[idx + leadingFieldCount]);
  };

  while (i < leaves.length) {
    if (isEntryStart(i)) {
      const fields = leaves.slice(i, i + leadingFieldCount);
      const dateRange = leaves[i + leadingFieldCount];
      i += leadingFieldCount + 1;

      const extras: string[] = [];
      while (i < leaves.length && !isEntryStart(i)) {
        extras.push(leaves[i]);
        i += 1;
      }

      entries.push({ fields, dateRange, extras });
      continue;
    }

    i += 1;
  }

  if (options.recoverTrailingDatelessEntry) {
    const last = entries[entries.length - 1];
    if (last && last.extras.length >= leadingFieldCount) {
      const splitPoint = last.extras.length - leadingFieldCount;
      const possibleTrailingFields = last.extras.slice(splitPoint);
      const stillHasNoDate = possibleTrailingFields.every((f) => !isDate(f));
      if (stillHasNoDate) {
        last.extras = last.extras.slice(0, splitPoint);
        entries.push({ fields: possibleTrailingFields, dateRange: '', extras: [] });
      }
    }
  }

  return entries;
}