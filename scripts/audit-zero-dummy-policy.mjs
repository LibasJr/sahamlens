#!/usr/bin/env node
/**
 * Regression guard for known SahamLens Zero Dummy Policy violations.
 * This is intentionally conservative and complements (not replaces) human audit.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const ROOTS = ['app', 'components', 'modules', 'lib', 'shared'];
const EXCLUDED_PARTS = ['/__tests__/', '/tests/', '/fixtures/'];
const EXT = /\.(?:ts|tsx|js|jsx|mjs)$/i;

const knownBad = [
  ['synthetic broker generator', /generateRealisticBrokerTransactions/],
  ['unconditional broker-real flag', /hasRealBrokerData\s*:\s*true/],
  ['old fake technical export price', /currentPrice\s*\|\|\s*5000/],
  ['old fake export score 78', /\b(?:score|finalScore|technicalScore)\s*[:=]\s*78\b/],
  ['old fake moat score 82', /\b(?:score|moatScore)\s*[:=]\s*82\b/],
  ['old fake peer label IDX Prime', /['"`]IDX Prime['"`]/],
  ['old fake margin of safety', /\+18\.4%/],
  ['old fake ownership 54.94', /\b54\.94\b/],
  ['old fake ownership 38.20', /\b38\.20\b/],
  ['old fake ownership 6.86', /\b6\.86\b/],
  ['old macro GDP fallback', /GDP_GROWTH[^\n]{0,120}(?:\?\?|\|\|)\s*5\.05/],
  ['old macro inflation fallback', /INFLATION[^\n]{0,120}(?:\?\?|\|\|)\s*2\.15/],
  ['old macro BI-rate fallback', /BI_RATE[^\n]{0,120}(?:\?\?|\|\|)\s*6(?:\.0)?\b/],
  ['old fake ATR candle', /high\s*:\s*100[^\n]{0,80}low\s*:\s*90/],
  ['forbidden live full-day volume projection', /estimateFullDayVolume\s*\(/],
  ['forbidden synthetic volume progress model', /sessionVolumeProgressFraction\s*\(/],
  ['misleading export verification label', /Status Verifikasi Realtime|IDX Realtime Technical Engine|Menunggu Publikasi BEI/],
  ['old heuristic PE percentile', /\bpe\s*\/\s*25\b/],
  ['old heuristic PBV percentile', /\bpbv\s*\/\s*3\.5\b/],
  ['demo notifications with fabricated market signals', /INITIAL_DEMO_NOTIFICATIONS/],
  ['portfolio stale quote falls back to average buy', /currentPrice\s*=\s*h\.avgPrice/],
  ['single-quarter net income annualization', /quarterlyNetIncome\s*\*\s*4/],
  ['fabricated dashboard stop-loss 5pct', /current_price\s*\*\s*0\.95/],
  ['fabricated dashboard TP1 8pct', /current_price\s*\*\s*1\.08/],
  ['fabricated dashboard TP2 15pct', /current_price\s*\*\s*1\.15/],
  ['fabricated dashboard day-low 2pct', /current_price\s*\*\s*0\.98/],
  ['fabricated dashboard day-high 2pct', /current_price\s*\*\s*1\.02/],
];

async function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const unix = full.replaceAll('\\', '/');
    if (EXCLUDED_PARTS.some((part) => unix.includes(part))) continue;
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (EXT.test(entry.name)) out.push(full);
  }
  return out;
}

const files = (await Promise.all(ROOTS.map((r) => walk(path.join(ROOT, r))))).flat();
const failures = [];
for (const file of files) {
  const rel = path.relative(ROOT, file).replaceAll('\\', '/');
  const content = await fs.readFile(file, 'utf8');
  for (const [label, pattern] of knownBad) {
    if (pattern.test(content)) failures.push({ file: rel, label });
  }

  // Math.random in financial-data domains is a hard fail. Random UUID/UI animation outside
  // these domains is intentionally not caught here.
  const executableRandom = content.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*') && /Math\.random\s*\(/.test(line);
  });
  if (executableRandom && /^(?:modules\/(?:broker-flow|fundamental|technical|market|macro|recommendation|lens-radar)|app\/api\/)/.test(rel)) {
    failures.push({ file: rel, label: 'Math.random in financial/data API domain' });
  }
}

console.log('=== SAHAMLENS ZERO DUMMY REGRESSION AUDIT ===');
console.log(`Scanned ${files.length} production source files.`);
if (failures.length) {
  for (const item of failures) console.log(`FAIL  ${item.file}: ${item.label}`);
  console.log(`\nFAIL: ${failures.length} known dummy/synthetic regression signature(s).`);
  process.exit(1);
}
console.log('PASS: no known active financial dummy regression signatures found.');
console.log('NOTE: PASS is a code regression guard, not proof that production DB/upstream data are accurate.');
