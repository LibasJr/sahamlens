import fs from 'node:fs';
import path from 'node:path';

const roots = ['app', 'components'];
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
  }
}
for (const root of roots) if (fs.existsSync(root)) walk(root);

const clientFiles = [];
const largeClientFiles = [];
const staticHeavyImports = [];
const heavyPatterns = [
  ['TradingViewChart', /import\s+TradingViewChart\s+from/],
  ['html2canvas', /import\s+.*from\s+['"]html2canvas['"]/],
  ['jspdf', /import\s+.*from\s+['"]jspdf['"]/],
  ['html-to-image', /import\s+.*from\s+['"]html-to-image['"]/],
];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const isClient = /^\s*['"]use client['"];?/m.test(text.slice(0, 200));
  if (isClient) {
    clientFiles.push(file);
    const lines = text.split(/\r?\n/).length;
    if (lines >= 700) largeClientFiles.push({ file, lines });
  }
  for (const [name, re] of heavyPatterns) {
    if (re.test(text)) staticHeavyImports.push({ file, dependency: name });
  }
}

console.log(`[performance] client components: ${clientFiles.length}`);
console.log(`[performance] client files >=700 lines: ${largeClientFiles.length}`);
for (const item of largeClientFiles.sort((a,b)=>b.lines-a.lines).slice(0, 12)) {
  console.log(`  ${item.lines} lines  ${item.file}`);
}
if (staticHeavyImports.length) {
  console.error('[performance] FAIL: heavy modules still imported statically:');
  for (const item of staticHeavyImports) console.error(`  ${item.dependency}: ${item.file}`);
  process.exit(1);
}
console.log('[performance] PASS: no audited heavy module is statically imported.');
