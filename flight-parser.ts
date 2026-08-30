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
          if (typeof value === 'string' && value.trim().length > 0) {
            leaves.push(value.trim());
            continue;
          }
          if (Array.isArray(value)) {
            const isBareSingleElement = value[0] === '$';
            if (isBareSingleElement) {
              walk(value);
            } else {
              for (const item of value) {
                if (typeof item === 'string' && item.trim().length > 0) {
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

export function segmentExperienceLeaves(
  leaves: string[],
): Array<{ title: string; companyLine: string; dateRange: string; extras: string[] }> {
  const entries: Array<{ title: string; companyLine: string; dateRange: string; extras: string[] }> = [];
  let current: (typeof entries)[number] | null = null;
  let i = 0;

  while (i < leaves.length) {
    const isEntryStart =
      i + 2 < leaves.length &&
      !DATE_RANGE_PATTERN.test(leaves[i]) &&
      !DATE_RANGE_PATTERN.test(leaves[i + 1]) &&
      DATE_RANGE_PATTERN.test(leaves[i + 2]);

    if (isEntryStart) {
      current = { title: leaves[i], companyLine: leaves[i + 1], dateRange: leaves[i + 2], extras: [] };
      entries.push(current);
      i += 3;
    } else {
      current?.extras.push(leaves[i]);
      i += 1;
    }
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