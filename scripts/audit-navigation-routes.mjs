#!/usr/bin/env node
/** Fail the build audit when a primary navigation link has no matching App Router page. */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const NAV_FILES = ['components/Sidebar.tsx', 'components/MobileNav.tsx'];

function routePattern(pageFile) {
  const relative = pageFile
    .replace(/^app\//, '')
    .replace(/\/page\.tsx$/, '')
    .replace(/^page\.tsx$/, '');
  const segments = relative.split('/').filter(Boolean).filter((segment) => !/^\(.+\)$/.test(segment));
  const source = segments.map((segment) => {
    if (/^\[\.\.\..+\]$/.test(segment)) return '.+';
    if (/^\[\[\.\.\..+\]\]$/.test(segment)) return '.*';
    if (/^\[.+\]$/.test(segment)) return '[^/]+';
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/');
  return new RegExp(`^/${source}${source ? '' : '?'}$`);
}

async function pages(dir = path.join(ROOT, 'app')) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await pages(full));
    else if (entry.name === 'page.tsx') found.push(path.relative(ROOT, full).replaceAll('\\', '/'));
  }
  return found;
}

const links = new Set();
for (const file of NAV_FILES) {
  const source = await fs.readFile(path.join(ROOT, file), 'utf8');
  for (const match of source.matchAll(/(?:path|href):\s*['"](\/[^'"]*)['"]/g)) {
    links.add(match[1].split(/[?#]/)[0]);
  }
}

const pageFiles = await pages();
const patterns = pageFiles.map((file) => ({ file, pattern: routePattern(file) }));
const missing = [...links].filter((link) => !patterns.some(({ pattern }) => pattern.test(link)));

console.log('=== SAHAMLENS PRIMARY NAVIGATION ROUTE AUDIT ===');
console.log(`Checked ${links.size} unique menu links against ${pageFiles.length} App Router pages.`);
if (missing.length) {
  for (const link of missing) console.error(`FAIL missing page for menu link: ${link}`);
  process.exit(1);
}
console.log('PASS: every primary desktop/mobile menu link resolves to an application page.');
