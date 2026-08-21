import fs from 'node:fs';

const job = process.argv[2];
const allowed = new Set([
  'ai-pick-scan',
  'backtest-precompute',
  'breakout-scan',
  'fundamental-snapshot',
  'macro',
  'market-pulse',
  'market-summary',
  'news',
  'recommendation-scan',
  'watchlist-alert',
]);

if (!allowed.has(job)) {
  console.error(`Job tidak diizinkan: ${job}`);
  process.exit(2);
}

function readCronSecret() {
  for (const file of [
    '/opt/sahamlens/app/.env.local',
    '/opt/sahamlens/app/.env.production',
    '/opt/sahamlens/app/.env',
  ]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line.startsWith('CRON_SECRET=')) continue;
      let value = line.slice('CRON_SECRET='.length).trim();
      if ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value) return value;
    }
  }
  return null;
}

const secret = readCronSecret();
if (!secret) {
  console.error('CRON_SECRET tidak ditemukan.');
  process.exit(3);
}

const url = `http://127.0.0.1:3001/api/cron/${job}`;
console.log(`[SahamLens Local Cron] START ${job}`);

const response = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
  signal: AbortSignal.timeout(30 * 60 * 1000),
});
const body = await response.text();

console.log(`[SahamLens Local Cron] ${job} -> HTTP ${response.status}`);
console.log(body.slice(0, 4000));
if (!response.ok) process.exit(1);
console.log(`[SahamLens Local Cron] DONE ${job}`);
