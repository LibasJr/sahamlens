import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cronRoot = path.join(root, 'app', 'api', 'cron');
const manifestPath = path.join(root, 'config', 'scheduled-jobs.json');
const vercelPath = path.join(root, 'vercel.json');

function fail(message) {
  console.error(`[scheduled-jobs] FAIL: ${message}`);
  process.exitCode = 1;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const routes = fs.readdirSync(cronRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(cronRoot, entry.name, 'route.ts')))
  .map((entry) => `/api/cron/${entry.name}`)
  .sort();
const jobs = [...manifest.jobs].sort((a, b) => a.path.localeCompare(b.path));
const manifestPaths = jobs.map((job) => job.path);

for (const route of routes) {
  if (!manifestPaths.includes(route)) fail(`route ${route} belum tercatat di manifest`);
}
for (const job of jobs) {
  if (!routes.includes(job.path)) fail(`manifest menunjuk route yang tidak ada: ${job.path}`);
}

const duplicates = manifestPaths.filter((value, index) => manifestPaths.indexOf(value) !== index);
if (duplicates.length) fail(`duplicate path: ${[...new Set(duplicates)].join(', ')}`);

const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
for (const cron of vercel.crons ?? []) {
  const job = jobs.find((candidate) => candidate.path === cron.path);
  if (!job) {
    fail(`Vercel cron ${cron.path} tidak ada di manifest`);
    continue;
  }
  if (job.provider !== 'vercel') fail(`${cron.path} provider manifest bukan vercel`);
  if (job.schedule !== cron.schedule) fail(`${cron.path} schedule manifest berbeda dari vercel.json`);
}

const unknown = jobs.filter((job) => job.scheduleStatus === 'verify-dashboard');
if (!process.exitCode) {
  console.log(`[scheduled-jobs] PASS: ${routes.length} cron route tercatat; ${unknown.length} jadwal QStash masih harus diverifikasi dari dashboard.`);
}
