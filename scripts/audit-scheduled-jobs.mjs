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
    `vercel.json berisi ${vercelCrons.length} entri crons. Penjadwal production adalah systemd timer di VPS; ` +
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

// Insiden 2026-09-23/24: kolektor bank fundamental memanggil endpoint-nya sendiri lewat
// hostname publik (terowongan Cloudflare). Terowongan timeout (HTTP 524) dan job dilaporkan
// gagal padahal aplikasinya sehat. Semua unit cron WAJIB memakai loopback.
const deployRoot = path.join(root, 'deploy');
const unitFiles = [];
if (fs.existsSync(deployRoot)) {
  for (const dir of fs.readdirSync(deployRoot, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const dirPath = path.join(deployRoot, dir.name);
    for (const entry of fs.readdirSync(dirPath)) {
      if (entry.endsWith('.service')) unitFiles.push(path.join(dirPath, entry));
    }
  }
}
for (const unit of unitFiles) {
  const body = fs.readFileSync(unit, 'utf8');
  const exec = body.split('\n').find((line) => line.startsWith('ExecStart=')) ?? '';
  if (!exec.includes('/api/')) continue;
  if (!exec.includes('http://127.0.0.1:3001')) {
    fail(`${path.relative(root, unit)} memanggil endpoint sendiri tanpa loopback 127.0.0.1:3001 (jalur Cloudflare bisa timeout 524 dan membuat job tampak gagal)`);
  }
}

// Drift: unit yang benar-benar dipasang di VPS harus identik dengan berkas di repo. Perbedaan
// inilah yang membuat unit intraday-collect masih memakai hostname publik sampai 2026-09-24.
const systemUnitDir = '/etc/systemd/system';
if (fs.existsSync(systemUnitDir)) {
  for (const unit of unitFiles) {
    const installed = path.join(systemUnitDir, path.basename(unit));
    if (!fs.existsSync(installed)) {
      fail(`${path.basename(unit)} belum dipasang di ${systemUnitDir} (repo punya berkasnya, VPS tidak)`);
      continue;
    }
    const repoBody = fs.readFileSync(unit, 'utf8').trimEnd();
    const installedBody = fs.readFileSync(installed, 'utf8').trimEnd();
    if (repoBody !== installedBody) fail(`${path.basename(unit)} berbeda antara repo dan ${systemUnitDir} (drift konfigurasi)`);
  }
}

// Unit yatim: berkas unit yang memanggil /api/cron/<nama> tanpa rute yang ada akan diam-diam
// tidak pernah berhasil. Itu yang terjadi pada broker-summary-scan (rute dihapus di #379, unit
// systemd-nya tertinggal dan tetap "disabled" tiga minggu tanpa ada yang menyadari).
for (const unit of unitFiles) {
  const body = fs.readFileSync(unit, 'utf8');
  const exec = body.split('\n').find((line) => line.startsWith('ExecStart=')) ?? '';
  const match = exec.match(/\/api\/cron\/([a-z0-9-]+)/);
  if (!match) continue;
  const routeFile = path.join(cronRoot, match[1], 'route.ts');
  if (!fs.existsSync(routeFile)) {
    fail(`${path.relative(root, unit)} memanggil /api/cron/${match[1]} tetapi rutenya tidak ada (unit yatim, hapus atau pulihkan rutenya)`);
  }
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
