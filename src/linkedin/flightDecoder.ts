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
      // Not valid JSON on this line — skip it.
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
      if (refMatch) return resolveChunk(refMatch[1]);
      return value;
    }
    if (Array.isArray(value)) return value.map(resolveValue);
    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) result[key] = resolveValue(val);
      return result;
    }
    return value;
  }

  function resolveChunk(id: string): unknown {
    if (cache.has(id)) return cache.get(id);
    if (resolving.has(id)) return `$L${id}`;

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

function isFlightSentinel(value: string): boolean {
  return value === '$undefined' || value === '$null';
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
          if (typeof value === 'string' && value.trim().length > 0 && !isFlightSentinel(value)) {
            leaves.push(value.trim());
            continue;
          }
          if (Array.isArray(value)) {
            const isBareSingleElement = value[0] === '$';
            if (isBareSingleElement) {
              walk(value);
            } else {
              for (const item of value) {
                if (typeof item === 'string' && item.trim().length > 0 && !isFlightSentinel(item)) {
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

export function collectValuesByKey(tree: unknown, key: string, results: string[] = []): string[] {
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