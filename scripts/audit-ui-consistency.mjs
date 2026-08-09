#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components'];
const EXTENSIONS = new Set(['.tsx', '.ts', '.css']);
const EXPORT_EXCEPTIONS = ['/components/export/'];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if ([...EXTENSIONS].some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

function pushMatches(bucket, file, text, regex, message, filter = () => true) {
  for (const match of text.matchAll(regex)) {
    if (!filter(match)) continue;
    bucket.push(`${relative(ROOT, file)}:${lineNumber(text, match.index ?? 0)} ${message}: ${match[0].slice(0, 100)}`);
  }
}

const files = (await Promise.all(SCAN_DIRS.map((dir) => walk(join(ROOT, dir))))).flat();
const errors = [];
const warnings = [];
let tinyTextCount = 0;
let monoCount = 0;
let fixedWidthCount = 0;

for (const file of files) {
  const normalized = file.replaceAll('\\', '/');
  const text = await readFile(file, 'utf8');
  const exportOnly = EXPORT_EXCEPTIONS.some((part) => normalized.includes(part));

  pushMatches(errors, file, text, /(?:â€|âœ|Â[·•]|Ã.|ðŸ)/g, 'mojibake/encoding corruption');
  pushMatches(errors, file, text, /font-serif\b/g, 'font-serif tidak termasuk design system SahamLens');

  for (const match of text.matchAll(/text-\[(8|9|9\.5)px\]/g)) {
    tinyTextCount++;
    warnings.push(`${relative(ROOT, file)}:${lineNumber(text, match.index ?? 0)} text sangat kecil (${match[0]}); pastikan hanya eyebrow/meta sekunder`);
  }

  for (const match of text.matchAll(/font-mono\b/g)) monoCount++;

  if (!exportOnly) {
    for (const match of text.matchAll(/(?:^|\s)(?:min-)?w-\[(\d{3,4})px\]/gm)) {
      const width = Number(match[1]);
      if (width >= 480) {
        fixedWidthCount++;
        warnings.push(`${relative(ROOT, file)}:${lineNumber(text, match.index ?? 0)} fixed width ${width}px; pastikan punya responsive/overflow guard`);
      }
    }
  }
}

console.log('SahamLens UI Consistency Audit');
console.log(`Scanned: ${files.length} TS/TSX/CSS files`);
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Tiny text occurrences: ${tinyTextCount}`);
console.log(`font-mono occurrences (data/code allowed): ${monoCount}`);
console.log(`Large fixed-width occurrences outside export cards: ${fixedWidthCount}`);

if (errors.length) {
  console.log('\nERRORS');
  errors.forEach((item) => console.log(`- ${item}`));
}
if (warnings.length) {
  console.log('\nWARNINGS (review, not automatic failure)');
  warnings.slice(0, 80).forEach((item) => console.log(`- ${item}`));
  if (warnings.length > 80) console.log(`- ... ${warnings.length - 80} warning lain`);
}

if (errors.length) process.exit(1);
console.log('\nPASS: tidak ada critical typography/encoding violation.');
