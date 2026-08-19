import fs from 'node:fs';
const cap = fs.readFileSync('lib/utils/cap-tier.ts', 'utf8');
const dashboard = [
  fs.readFileSync('app/dashboard/page.tsx', 'utf8'),
  fs.readFileSync('components/dashboard/DashboardStockOverview.tsx', 'utf8'),
].join('\n');
const forbiddenIdentity = [/['\"]BLUE_CHIP['\"]/, /['\"]SMALL_CAP['\"]/, />\s*Blue-chip\s*</i, />\s*Small-cap\s*</i];
let fail = 0;
for (const pattern of forbiddenIdentity) {
  if (pattern.test(cap) || pattern.test(dashboard)) {
    console.error(`FAIL: label identitas realtime masih ditemukan: ${pattern}`);
    fail++;
  }
}
if (!/saat ini/i.test(dashboard) || !/bukan penilaian kualitas|bukan.*identitas/i.test(dashboard)) {
  console.error('FAIL: badge market-cap/liquidity belum menjelaskan bahwa ia kondisi saat ini, bukan identitas/kualitas.');
  fail++;
}
if (!fail) console.log('PASS: label market-cap/liquidity memakai semantik kondisi saat ini dan tidak mengklaim identitas blue-chip.');
process.exitCode = fail ? 1 : 0;
