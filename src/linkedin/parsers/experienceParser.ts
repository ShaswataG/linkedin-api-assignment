import { Position, ExperienceEntry } from '../../api/routes/profile';
import { DATE_RANGE_PATTERN, DURATION_ONLY_PATTERN, splitMiddotField, splitDateRange, extractLocation } from '../fieldUtils';

export function segmentExperienceLeaves(leaves: string[]): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  let i = 0;

  const isDate = (s: string) => DATE_RANGE_PATTERN.test(s);
  const isDuration = (s: string) => DURATION_ONLY_PATTERN.test(s);

  const isGroupedStart = (idx: number) =>
    idx + 3 < leaves.length &&
    !isDate(leaves[idx]) &&
    isDuration(leaves[idx + 1]) &&
    !isDate(leaves[idx + 2]) &&
    isDate(leaves[idx + 3]);

  const isFlatStart = (idx: number) =>
    idx + 2 < leaves.length &&
    !isDate(leaves[idx]) &&
    !isDuration(leaves[idx + 1]) &&
    !isDate(leaves[idx + 1]) &&
    isDate(leaves[idx + 2]);

  const isRolePairStart = (idx: number) =>
    idx + 1 < leaves.length && !isDate(leaves[idx]) && isDate(leaves[idx + 1]);

  while (i < leaves.length) {
    if (isGroupedStart(i)) {
      const companyName = leaves[i];
      const totalDuration = leaves[i + 1];
      i += 2;

      const positions: Position[] = [];
      while (i < leaves.length && isRolePairStart(i)) {
        const title = leaves[i];
        const dateRange = leaves[i + 1];
        i += 2;

        const extras: string[] = [];
        while (i < leaves.length && !isRolePairStart(i) && !isFlatStart(i) && !isGroupedStart(i)) {
          extras.push(leaves[i]);
          i += 1;
        }

        const { location, locationType, remainingExtras } = extractLocation(extras);
        const { startDate, endDate, duration } = splitDateRange(dateRange);
        positions.push({
          title,
          startDate,
          endDate,
          duration,
          location,
          locationType,
          description: remainingExtras.join(' '),
        });
      }

      const { primary: companyNameOnly } = splitMiddotField(companyName);
      entries.push({ companyName: companyNameOnly, totalDuration, positions });
      continue;
    }

    if (isFlatStart(i)) {
      const title = leaves[i];
      const companyRaw = leaves[i + 1];
      const dateRange = leaves[i + 2];
      i += 3;

      const extras: string[] = [];
      while (i < leaves.length && !isFlatStart(i) && !isGroupedStart(i)) {
        extras.push(leaves[i]);
        i += 1;
      }

      const { primary: companyName, secondary: employmentType } = splitMiddotField(companyRaw);
      const { location, locationType, remainingExtras } = extractLocation(extras);
      const { startDate, endDate, duration } = splitDateRange(dateRange);
      entries.push({
        companyName,
        employmentType,
        positions: [
          { title, startDate, endDate, duration, location, locationType, description: remainingExtras.join(' ') },
        ],
      });
      continue;
    }

    // Leading noise (e.g. the literal section header text "Experience") — discard.
    i += 1;
  }

  return entries;
}