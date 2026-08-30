/**
 * React Server Components "Flight" wire-format parser.
 * ------------------------------------------------------------------
 * This is a public, documented protocol used by React Server Components
 * to stream a component tree as data. It is NOT LinkedIn-specific —
 * LinkedIn just happens to use it to serve profile card content from
 * `flagship-web/rsc-action/actions/component`.
 *
 * Wire format, roughly:
 *   Each line is: "{id}:{tag}{jsonPayload}"
 *     - id        → a hex or decimal chunk identifier
 *     - tag       → optional single letter (e.g. "I" for a module import
 *                   reference); absent for a plain data chunk
 *     - payload   → JSON (array/object/primitive)
 *
 * References inside a payload look like the string "$L{id}" or "$@{id}"
 * and mean "substitute the resolved value of chunk {id} here". We parse
 * every chunk first, then lazily resolve references on read, with cycle
 * protection since component trees can be self-referential.
 */

export interface FlightChunk {
  id: string;
  tag: string | null; // e.g. 'I' for import chunks — usually irrelevant to data extraction
  raw: unknown;
}

const LINE_PATTERN = /^([0-9a-fA-F]+):([A-Za-z]?)(.*)$/s;
const REFERENCE_PATTERN = /^\$(?:L|@)([0-9a-fA-F]+)$/;

/**
 * Step 1: split the raw response text into individually-parsed chunks.
 * Malformed or non-JSON lines are skipped rather than throwing — a
 * partial parse is more useful than a hard failure on one bad chunk.
 */
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
      // Not valid JSON on this line — skip it. Worth logging during
      // development so you notice if you're losing real data, not just
      // import-reference noise.
    }
  }

  return chunks;
}

/**
 * Step 2: resolve "$L{id}" / "$@{id}" references into their actual
 * values, walking arbitrarily nested arrays/objects. Cycle-safe via a
 * `resolving` set — if a reference points back into something already
 * being resolved, we leave it as the raw reference string rather than
 * recursing forever.
 */
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

    // Import-declaration chunks ("I" tag) describe WHICH client component
    // renders at this reference point — they are not data, and must not
    // be inlined as if they were a rendered value. Doing so previously
    // caused module names like "ClientComponent" to be misidentified as
    // real profile text. Mark these distinctly instead of substituting
    // their raw descriptor array.
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

/**
 * Convenience entry point: parse + resolve in one call.
 */
export function decodeFlightResponse(rawText: string, rootId = '0'): unknown {
  const chunks = parseFlightChunks(rawText);
  return resolveFlightTree(chunks, rootId);
}

/**
 * Walks a resolved Flight tree and collects every string value found
 * under a given object key — useful as a first exploratory pass before
 * you know the exact tree shape for a given card. E.g.
 * `collectValuesByKey(tree, 'text')` to see every bit of literal text
 * LinkedIn embedded in this component's data.
 *
 * This is intentionally broad/exploratory, not a final extractor — use
 * it once to understand the shape, then write a targeted extractor
 * (like the ExperienceParser pattern) once you know the real key names.
 */
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

/**
 * LinkedIn's SDUI payloads don't expose semantically-keyed fields
 * (no `title:`, `companyName:`, etc.) — text runs are bare strings
 * embedded as the 3rd element of small `[tag, props, text]`-style
 * arrays, in the same order they render visually. This walks the tree
 * and returns those strings in document order, which is the real
 * signal to parse against — not the key names.
 */
/**
 * LinkedIn's SDUI payloads store real text as the value of a `children`
 * key — either a plain string, or (more commonly) a single-element array
 * containing the string, e.g. `"children": ["Flipkart"]`. Some styled-text
 * components nest this one level deeper under `textProps.children`. There
 * is no fixed array position or component type to key off — the reliable
 * signal is simply "does a `children` field resolve to string content".
 *
 * This replaces an earlier, incorrect version of this function that
 * assumed text sat at a fixed array index — that version was actually
 * matching internal React module names, not real content. Verified
 * against real captured responses before landing on this shape.
 */
export function extractOrderedTextLeaves(tree: unknown): string[] {
  const leaves: string[] = [];

  // Flight-protocol sentinel strings for special values (undefined,
  // null) that can surface literally as text under a `children` key —
  // not real profile content, and must not be treated as such.
  function isFlightSentinel(value: string): boolean {
    return value === '$undefined' || value === '$null';
  }

  function walk(node: unknown): void {
    if (node && typeof node === 'object' && '__clientComponentRef' in node) {
      return; // structural marker, never real content
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
            // A `children` array can mean two different things:
            //   1. A list of multiple children: ["Flipkart"] or
            //      [["$","p",null,{...}]]
            //   2. A single child written as a bare element tuple,
            //      unwrapped: ["$", "div", null, {...}]
            // Distinguish by checking if this array itself IS an
            // element (starts with the "$" discriminator) rather than
            // a list containing one. Treating case 2 as a list of
            // children was the previous bug — it walked into "$" and
            // the tag name ("div") as if they were separate string
            // children.
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
  location?: string;
  locationType?: string;
  description?: string;
}

export interface ExperienceEntry {
  companyName: string;
  employmentType?: string;
  totalDuration?: string;
  positions: Position[];
}

/**
 * LinkedIn frequently bundles a company/location name with a secondary
 * attribute using a middot separator, e.g. "Kustodian.life · Full-time"
 * or "Bengaluru, Karnataka, India · On-site". Splits that apart rather
 * than leaving the raw combined string in a single field — leaving it
 * unsplit is misleading in cases like "Self Employed · Self-employed",
 * where the redundancy makes it obvious the fields were never meant to
 * be one value.
 */
function splitMiddotField(raw: string): { primary: string; secondary?: string } {
  const parts = raw.split('·').map((p) => p.trim()).filter(Boolean);
  return { primary: parts[0] ?? raw.trim(), secondary: parts[1] };
}

/**
 * Splits a combined date-range string, e.g. "Jun 2026 - Present · 3 mos",
 * into separate startDate/endDate/duration fields. The aggregate duration
 * suffix (after the middot) is optional — handles both
 * "Jun 2026 - Present · 3 mos" and a bare "Jun 2026 - Present".
 */
function splitDateRange(raw: string): { startDate: string; endDate: string; duration?: string } {
  const [rangePart, durationPart] = raw.split('·').map((s) => s.trim());
  const dashMatch = rangePart.match(/^(.*?)\s*[-–]\s*(.*)$/);
  if (dashMatch) {
    return { startDate: dashMatch[1].trim(), endDate: dashMatch[2].trim(), duration: durationPart };
  }
  return { startDate: '', endDate: '', duration: raw };
}

/**
 * LinkedIn appends a work-arrangement tag to a location using the same
 * middot convention, e.g. "Bengaluru, Karnataka, India · On-site". This
 * only shows up as the first item in a position's trailing extras (right
 * after the date), when present at all — checked against a known set of
 * arrangement values rather than assumed positionally, since a profile
 * with no location listed should not have its first real description
 * sentence mistaken for one.
 */
const LOCATION_TYPE_VALUES = new Set(['On-site', 'Remote', 'Hybrid']);

function extractLocation(
  extras: string[],
): { location?: string; locationType?: string; remainingExtras: string[] } {
  if (extras.length === 0) return { remainingExtras: extras };
  const { primary, secondary } = splitMiddotField(extras[0]);
  if (secondary && LOCATION_TYPE_VALUES.has(secondary)) {
    return { location: primary, locationType: secondary, remainingExtras: extras.slice(1) };
  }
  return { remainingExtras: extras };
}

const DURATION_ONLY_PATTERN = /^~?\d+\s*(yrs?|years?)(\s+\d+\s*(mos?|months?))?$|^~?\d+\s*(mos?|months?)$/i;

/**
 * Segments a flat, ordered leaf list into per-company experience entries,
 * handling BOTH shapes found in real data:
 *
 *   Flat entry:    [title, company, dateRange, ...extras]
 *   Grouped entry: [company, totalDuration, role1Title, role1Date, ...extras,
 *                    role2Title, role2Date, ...extras, ...]  (a promotion
 *                    history — one company, multiple roles, no company name
 *                    repeated per role)
 *
 * The two shapes are disambiguated by the SECOND field: a flat entry's
 * second field is a company name; a grouped entry's second field is a
 * bare duration ("3 yrs 3 mos") with no dash — a shape that never appears
 * in a flat entry. Grouped detection is checked first since its 4-token
 * lookahead is more specific.
 */
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
          {
            title,
            startDate,
            endDate,
            duration,
            location,
            locationType,
            description: remainingExtras.join(' '),
          },
        ],
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

/**
 * Groups a flat, ordered list of text leaves (from one experience item)
 * into a best-guess structured shape, using pattern matching + position
 * rather than key names — since none exist in the source data.
 *
 * This is intentionally a heuristic starting point, not a finished
 * parser: verify against a few real examples and adjust the ordering
 * assumptions to match what you actually observe.
 */
export function classifyExperienceLeaves(leaves: string[]): Partial<{
  title: string;
  companyLine: string;
  dateRange: string;
  location: string;
  description: string;
}> {
  const result: ReturnType<typeof classifyExperienceLeaves> = {};
  const remaining = [...leaves];

  // Date range has the most distinctive pattern — find it first,
  // wherever it falls positionally.
  const dateIndex = remaining.findIndex((l) => DATE_RANGE_PATTERN.test(l));
  if (dateIndex !== -1) {
    result.dateRange = remaining[dateIndex];
  }

  // By convention on LinkedIn cards: title comes first, company second,
  // whatever's left after the date (and before a long description) is
  // usually location, and the longest remaining string is the description.
  if (remaining[0]) result.title = remaining[0];
  if (remaining[1]) result.companyLine = remaining[1];

  const longest = [...remaining].sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length > 60) {
    result.description = longest;
  }

  return result;
}

// ---------------------------------------------------------------------
// Example usage (run against a saved response body, e.g. from your HAR):
//
//   import { readFileSync } from 'fs';
//   const raw = readFileSync('profileCardsExperienceOnly.txt', 'utf-8');
//   const tree = decodeFlightResponse(raw);
//   console.log(JSON.stringify(tree, null, 2).slice(0, 2000)); // eyeball the shape
//   console.log(collectValuesByKey(tree, 'text'));             // quick text dump
// ---------------------------------------------------------------------