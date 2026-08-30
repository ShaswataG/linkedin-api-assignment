// run-parser-test.ts
console.log('--- running parser test ---');
import { readFileSync, writeFileSync  } from 'fs';
import { decodeFlightResponse, collectValuesByKey, extractOrderedTextLeaves, segmentExperienceLeaves } from './flight-parser';
console.log('--- running parser test ---');
const raw = readFileSync('experience-response.txt', 'utf-8');
const tree = decodeFlightResponse(raw);

// Eyeball the shape first — don't assume key names yet
console.log(JSON.stringify(tree, null, 2).slice(0, 3000));
writeFileSync('resolved-tree.json', JSON.stringify(tree, null, 2));

// Then try pulling text values once you've seen real keys in the output above
console.log('--- text values found ---');
console.log(collectValuesByKey(tree, 'text'));

const leaves = extractOrderedTextLeaves(tree);
const entries = segmentExperienceLeaves(leaves);
console.log(JSON.stringify(entries, null, 2));
console.log(leaves.length, 'text leaves found');
console.log(leaves.map((l) => l.length)); // lengths only — eyeball the pattern first

// Print just ONE repeating block (the first full 13-item group),
// numbered, so you can read it on your own screen.
const block = leaves.slice(4, 17); // indices 4 through 16
block.forEach((text, i) => {
  console.log(`${i}: "${text}"`);
});