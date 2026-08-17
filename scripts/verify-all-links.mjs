import fs from 'fs';
import path from 'path';

function getAppRoutes(dir = 'app', prefix = '') {
  let routes = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('api') || entry.name.startsWith('_')) continue;
      const subPrefix = prefix + '/' + entry.name;
      routes.push(...getAppRoutes(path.join(dir, entry.name), subPrefix));
    } else if (entry.name === 'page.tsx' || entry.name === 'page.jsx' || entry.name === 'page.js') {
      routes.push(prefix === '' ? '/' : prefix);
    }
  }
  return routes;
}

const appRoutes = getAppRoutes();

const knownRedirects = ['/citadel'];

function isValidRoute(href) {
  if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return true;
  const cleanPath = href.split('?')[0].split('#')[0];
  if (cleanPath === '/' || cleanPath === '') return true;
  if (knownRedirects.includes(cleanPath)) return true;
  if (appRoutes.includes(cleanPath)) return true;

  for (const r of appRoutes) {
    if (r.includes('[')) {
      const regexPattern = '^' + r.replace(/\[\.\.\.[^\]]+\]/g, '.*').replace(/\[[^\]]+\]/g, '[^/]+') + '$';
      if (new RegExp(regexPattern).test(cleanPath)) return true;
    }
  }
  return false;
}

function scanFiles(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanFiles(fullPath));
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = scanFiles('components').concat(scanFiles('app'));
const allHrefs = new Set();
let checked = 0;
let errors = [];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const hrefMatches = content.matchAll(/href=["'](\/[^"'#?]*)["']/g);
  for (const m of hrefMatches) {
    const href = m[1];
    allHrefs.add(href);
    checked++;
    if (!isValidRoute(href)) {
      errors.push({ file: f, href });
    }
  }
  const pathMatches = content.matchAll(/path:\s*["'](\/[^"'#?]*)["']/g);
  for (const m of pathMatches) {
    const p = m[1];
    allHrefs.add(p);
    checked++;
    if (!isValidRoute(p)) {
      errors.push({ file: f, path: p });
    }
  }
}

console.log('=== HASIL AUDIT NAVIGASI & TAUTAN SAHAMLENS ===');
console.log('Total halaman/rute di sistem:', appRoutes.length);
console.log('Total link & path unik ditemukan:', allHrefs.size);
console.log('Total titik tautan yang diverifikasi:', checked);

if (errors.length === 0) {
  console.log('✓ SEMUA MENU & LINK 100% VALID! Tidak ada link rusak / 404 / missing.');
} else {
  console.error('Ditemukan link yang tidak terdaftar:', errors);
}

// Print detailed map of menu groups
console.log('\nDaftar Rute Halaman Aktif:');
console.log(Array.from(allHrefs).sort());
