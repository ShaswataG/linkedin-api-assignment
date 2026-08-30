export const DATE_RANGE_PATTERN =
  /([A-Za-z]{3,9}\.?\s?\d{4}|\d{4})\s*[-–]\s*(Present|[A-Za-z]{3,9}\.?\s?\d{4}|\d{4})/;

export const DURATION_ONLY_PATTERN =
  /^~?\d+\s*(yrs?|years?)(\s+\d+\s*(mos?|months?))?$|^~?\d+\s*(mos?|months?)$/i;

export function splitMiddotField(raw: string): { primary: string; secondary?: string } {
  const parts = raw.split('·').map((p) => p.trim()).filter(Boolean);
  return { primary: parts[0] ?? raw.trim(), secondary: parts[1] };
}

export function splitDateRange(raw: string): { startDate: string; endDate: string; duration?: string } {
  const [rangePart, durationPart] = raw.split('·').map((s) => s.trim());
  const dashMatch = rangePart.match(/^(.*?)\s*[-–]\s*(.*)$/);
  if (dashMatch) {
    return { startDate: dashMatch[1].trim(), endDate: dashMatch[2].trim(), duration: durationPart };
  }
  return { startDate: '', endDate: '', duration: raw };
}

const LOCATION_TYPE_VALUES = new Set(['On-site', 'Remote', 'Hybrid']);

export function extractLocation(
  extras: string[],
): { location?: string; locationType?: string; remainingExtras: string[] } {
  if (extras.length === 0) return { remainingExtras: extras };
  const { primary, secondary } = splitMiddotField(extras[0]);
  if (secondary && LOCATION_TYPE_VALUES.has(secondary)) {
    return { location: primary, locationType: secondary, remainingExtras: extras.slice(1) };
  }
  return { remainingExtras: extras };
}