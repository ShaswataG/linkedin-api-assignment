export interface FlightChunk {
  id: string;
  tag: string | null;
  raw: unknown;
}

const LINE_PATTERN = /^([0-9a-fA-F]+):([A-Za-z]?)(.*)$/s;
const REFERENCE_PATTERN = /^\$(?:L|@)([0-9a-fA-F]+)$/;

export function parseFlightChunks(rawText: string): Map<string, FlightChunk> {
  const chunks = new Map<string, FlightChunk>();

  for (const line of rawText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(LINE_PATTERN);
    if (!match) continue;

    const [, id, tag, payloadText] = match;
    try {
      const raw = JSON.parse(payloadText);
      chunks.set(id, { id, tag: tag || null, raw });
    } catch {

    }
  }

  return chunks;
}

export function resolveFlightTree(
  chunks: Map<string, FlightChunk>,
  rootId: string = '0',
): unknown {
  const cache = new Map<string, unknown>();
  const resolving = new Set<string>();

  function resolveValue(value: unknown): unknown {
    if (typeof value === 'string') {
      const refMatch = value.match(REFERENCE_PATTERN);
      if (refMatch) {
        return resolveChunk(refMatch[1]);
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(resolveValue);
    }

    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = resolveValue(val);
      }
      return result;
    }

    return value;
  }

  function resolveChunk(id: string): unknown {
    if (cache.has(id)) return cache.get(id);
    if (resolving.has(id)) return `$L${id}`; // cycle guard — bail out gracefully

    const chunk = chunks.get(id);
    if (!chunk) return null;

    if (chunk.tag === 'I') {
      const exportName = Array.isArray(chunk.raw) ? chunk.raw[2] : undefined;
      const marker = { __clientComponentRef: exportName ?? null };
      cache.set(id, marker);
      return marker;
    }

    resolving.add(id);
    const resolved = resolveValue(chunk.raw);
    resolving.delete(id);

    cache.set(id, resolved);
    return resolved;
  }

  return resolveChunk(rootId);
}

export function decodeFlightResponse(rawText: string, rootId = '0'): unknown {
  const chunks = parseFlightChunks(rawText);
  return resolveFlightTree(chunks, rootId);
}

export function collectValuesByKey(
  tree: unknown,
  key: string,
  results: string[] = [],
): string[] {
  if (Array.isArray(tree)) {
    for (const item of tree) collectValuesByKey(item, key, results);
  } else if (tree && typeof tree === 'object') {
    for (const [k, v] of Object.entries(tree)) {
      if (k === key && typeof v === 'string') {
        results.push(v);
      } else {
        collectValuesByKey(v, key, results);
      }
    }
  }
  return results;
}

export function extractOrderedTextLeaves(tree: unknown): string[] {
  const leaves: string[] = [];

  function isFlightSentinel(value: string): boolean {
    return value === '$undefined' || value === '$null';
  }

  function walk(node: unknown): void {
    if (node && typeof node === 'object' && '__clientComponentRef' in node) {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'children') {
          if (
            typeof value === 'string' &&
            value.trim().length > 0 &&
            !isFlightSentinel(value)
          ) {
            leaves.push(value.trim());
            continue;
          }
          if (Array.isArray(value)) {
            const isBareSingleElement = value[0] === '$';
            if (isBareSingleElement) {
              walk(value);
            } else {
              for (const item of value) {
                if (
                  typeof item === 'string' &&
                  item.trim().length > 0 &&
                  !isFlightSentinel(item)
                ) {
                  leaves.push(item.trim());
                } else {
                  walk(item);
                }
              }
            }
            continue;
          }
        }
        walk(value);
      }
    }
  }

  walk(tree);
  return leaves;
}

export interface Position {
  title: string;
  startDate: string;
  endDate: string;
  duration?: string;
  description?: string;
}

export interface ExperienceEntry {
  companyName: string;
  employmentType?: string;
  totalDuration?: string;
  positions: Position[];
}

function splitMiddotField(raw: string): { primary: string; secondary?: string } {
  const parts = raw.split('·').map((p) => p.trim()).filter(Boolean);
  return { primary: parts[0] ?? raw.trim(), secondary: parts[1] };
}

const DURATION_ONLY_PATTERN = /^~?\d+\s*(yrs?|years?)(\s+\d+\s*(mos?|months?))?$|^~?\d+\s*(mos?|months?)$/i;

export function segmentExperienceLeaves(
  leaves: string[],
): ExperienceEntry[] {
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
        positions.push({ title, startDate: '', endDate: '', duration: dateRange, description: extras.join(' ') });
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
      entries.push({
        companyName,
        employmentType,
        positions: [{ title, startDate: '', endDate: '', duration: dateRange, description: extras.join(' ') }],
      });
      continue;
    }

    // Leading noise (e.g. the literal section header text) — discard.
    i += 1;
  }

  return entries;
}

const DATE_RANGE_PATTERN =
  /([A-Za-z]{3,9}\.?\s?\d{4}|\d{4})\s*[-–]\s*(Present|[A-Za-z]{3,9}\.?\s?\d{4}|\d{4})/;

export function classifyExperienceLeaves(leaves: string[]): Partial<{
  title: string;
  companyLine: string;
  dateRange: string;
  location: string;
  description: string;
}> {
  const result: ReturnType<typeof classifyExperienceLeaves> = {};
  const remaining = [...leaves];

  const dateIndex = remaining.findIndex((l) => DATE_RANGE_PATTERN.test(l));
  if (dateIndex !== -1) {
    result.dateRange = remaining[dateIndex];
  }

  if (remaining[0]) result.title = remaining[0];
  if (remaining[1]) result.companyLine = remaining[1];

  const longest = [...remaining].sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length > 60) {
    result.description = longest;
  }

  return result;
}