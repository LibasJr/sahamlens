import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'modules/market/constants/manual-reference-review.ts');
const text = fs.readFileSync(file, 'utf8');
const todayWib = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const reviews = [...text.matchAll(/id:\s*'([^']+)'[\s\S]*?reviewedAt:\s*'(\d{4}-\d{2}-\d{2})'[\s\S]*?reviewBy:\s*'(\d{4}-\d{2}-\d{2})'[\s\S]*?identityClaim:\s*(true|false)/g)]
  .map((m) => ({ id: m[1], reviewedAt: m[2], reviewBy: m[3], identityClaim: m[4] === 'true' }));

if (!reviews.length) {
  console.error('FAIL: tidak ada metadata manual market reference yang dapat diaudit.');
  process.exit(1);
}
let fail = 0;
for (const r of reviews) {
  if (r.identityClaim) { console.error(`FAIL ${r.id}: identityClaim=true tidak diizinkan untuk daftar manual.`); fail++; }
  if (r.reviewedAt >= r.reviewBy) { console.error(`FAIL ${r.id}: reviewBy harus setelah reviewedAt.`); fail++; }
  if (todayWib > r.reviewBy) { console.error(`FAIL ${r.id}: review kedaluwarsa ${r.reviewBy}; hari ini ${todayWib}.`); fail++; }
  else console.log(`PASS ${r.id}: reviewed=${r.reviewedAt}, reviewBy=${r.reviewBy}`);
}
process.exitCode = fail ? 1 : 0;
