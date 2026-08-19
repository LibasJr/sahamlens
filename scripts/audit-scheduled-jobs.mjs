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

// Production pindah ke VPS 2026-08-12/13. Vercel Cron TIDAK dipakai lagi, dan blok
// `crons` di vercel.json pernah menghidupkan penjadwal kedua yang menulis ke database
// Neon yang sama - lihat commit 2a64988 dan bagian "Jebakan" di docs/operations/DEPLOYMENT.md.
const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
const vercelCrons = vercel.crons ?? [];

if (vercelCrons.length) {
  fail(
    `vercel.json berisi ${vercelCrons.length} entri crons. Penjadwal production adalah systemd timer di VPS + QStash; ` +
    'blok crons di vercel.json membuat Vercel ikut menjalankan job yang sama terhadap database yang sama. Hapus bloknya.'
  );
}

// Arah sebaliknya juga harus dijaga: manifest yang masih mengklaim provider "vercel"
// sementara vercel.json tidak menjadwalkan apa pun adalah dokumentasi yang berbohong,
// dan itulah yang bikin orang berikutnya salah menebak siapa penjadwalnya.
for (const job of jobs) {
  if (job.provider !== 'vercel') continue;
  const cron = vercelCrons.find((candidate) => candidate.path === job.path);
  if (!cron) {
    fail(`${job.path} ditandai provider vercel di manifest, tapi tidak ada di vercel.json - penjadwal sebenarnya harus ditulis (systemd/qstash)`);
    continue;
  }
  if (job.schedule !== cron.schedule) fail(`${job.path} schedule manifest berbeda dari vercel.json`);
}

const byProvider = (name) => jobs.filter((job) => job.provider === name).length;
const unverified = jobs.filter((job) => !['known', 'disabled-by-policy'].includes(job.scheduleStatus));
if (!process.exitCode) {
  console.log(
    `[scheduled-jobs] PASS: ${routes.length} cron route tercatat ` +
    `(${byProvider('systemd')} systemd di VPS, ${byProvider('qstash')} QStash, ${byProvider('vercel')} Vercel); ` +
    `${unverified.length} jadwal masih harus diverifikasi di sumbernya.`
  );
}
