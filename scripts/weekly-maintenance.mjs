#!/usr/bin/env node
/**
 * Perawatan mingguan SahamLens: satu perintah yang menyegarkan data lambat, memeriksa
 * keamanan dependency, lalu menjalankan gerbang produksi penuh - dan menulis laporan
 * yang masih bisa dibaca minggu depan.
 *
 * TIGA KEPUTUSAN YANG MEMBENTUK BERKAS INI.
 *
 * 1. Gerbang bug/optimasi TIDAK ditulis ulang di sini. Stage `quality` memanggil
 *    `npm run verify:prod` apa adanya. Menyalin daftar audit ke berkas ini berarti
 *    daftar itu akan drift dari verify:prod dalam hitungan minggu, dan gerbang yang
 *    drift lulus tanpa memeriksa apa pun - persis kegagalan yang diperingatkan
 *    CLAUDE.md §2.
 *
 * 2. Job ini HANYA MELAPOR. Tidak ada `npm audit fix`, migrasi, atau commit otomatis.
 *    Ia jalan Minggu 03:30 tanpa penunggu; perbaikan otomatis yang salah di jam itu
 *    baru ketahuan Senin pagi.
 *
 * 3. Stage `quality` menolak jalan di /opt/sahamlens/app. Rantai verify:prod memuat
 *    `next build`, dan itu menimpa .next/ yang sedang dibaca proses `next start` yang
 *    melayani pengguna (CLAUDE.md §7). Job ini bekerja di worktree perawatan sendiri
 *    yang disegarkan ke origin/main lebih dulu lewat stage `sync`.
 *
 * Jalankan:
 *   npm run maintain:weekly:dry                       # lihat rencananya
 *   npm run maintain:weekly:audit                     # audit saja, tanpa menyentuh data
 *   node --env-file=/opt/sahamlens/app/.env.production scripts/weekly-maintenance.mjs --sync
 *
 * Exit code 1 kalau ada langkah FAIL (atau ada WARN bila --fail-on=warn).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const STAGES = ['sync', 'data', 'security', 'quality', 'deps'];
const PRODUCTION_CHECKOUT = process.env.SAHAMLENS_PRODUCTION_CHECKOUT ?? '/opt/sahamlens/app';

// ---------------------------------------------------------------- argumen CLI
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback = null) => {
  const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const listValue = (name) => {
  const raw = value(name);
  return raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : [];
};

const only = listValue('only');
const skip = listValue('skip');
const dryRun = flag('dry-run');
const failOnWarn = value('fail-on', 'fail') === 'warn';
const jsonOnly = flag('json');
const configPath = value('config', 'config/weekly-maintenance.json');

for (const stage of [...only, ...skip]) {
  if (!STAGES.includes(stage)) {
    console.error(`[maintenance] stage tidak dikenal: ${stage}. Pilihan: ${STAGES.join(', ')}`);
    process.exit(2);
  }
}
// `sync` mengubah isi direktori kerja, jadi ia hanya jalan kalau diminta eksplisit.
const activeStages = STAGES.filter((stage) => {
  if (stage === 'sync' && !flag('sync') && !only.includes('sync')) return false;
  return (only.length ? only.includes(stage) : true) && !skip.includes(stage);
});
const dataEnabled = activeStages.includes('data') && !flag('no-data');

const config = JSON.parse(fs.readFileSync(path.resolve(ROOT, configPath), 'utf8'));
const baseUrl = (value('base-url', config.baseUrl) ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');
const keepReports = Number(value('keep', config.keepReports ?? 12));

/** realpath supaya symlink dan trailing slash tidak lolos sebagai path lain. */
const canonical = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const insideProductionCheckout = canonical(ROOT) === canonical(PRODUCTION_CHECKOUT);

// -------------------------------------------------------------- wadah laporan
const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
// path.resolve, bukan join: reportDir absolut (dipakai test & operator) harus dihormati.
const reportDir = path.resolve(ROOT, config.reportDir ?? 'reports/weekly-maintenance', stamp);
const logDir = path.join(reportDir, 'logs');
if (!dryRun) fs.mkdirSync(logDir, { recursive: true });

const results = [];
const say = (line) => { if (!jsonOnly) console.log(line); };

function tail(text, lines = 25) {
  const rows = String(text ?? '').replace(/\s+$/, '').split(/\r?\n/);
  return rows.slice(-lines).join('\n');
}

function record(entry) {
  results.push(entry);
  const icon = { PASS: 'OK  ', WARN: 'WARN', FAIL: 'FAIL', SKIP: 'SKIP' }[entry.status];
  say(`[maintenance] ${icon} ${entry.stage}/${entry.id} - ${entry.summary} (${entry.durationMs} ms)`);
}

/** Menjalankan satu perintah dan menyimpan seluruh keluarannya ke berkas log. */
function runCommand({ id, stage, label, command, args, softFail = false, parse, env }) {
  if (dryRun) {
    record({ id, stage, label, status: 'SKIP', summary: `dry-run: ${command} ${args.join(' ')}`, durationMs: 0, detail: '' });
    return null;
  }
  const begin = Date.now();
  const child = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  const durationMs = Date.now() - begin;
  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  fs.writeFileSync(path.join(logDir, `${stage}-${id}.log`), output || '(tanpa keluaran)', 'utf8');

  let status = child.status === 0 ? 'PASS' : (softFail ? 'WARN' : 'FAIL');
  let summary = child.status === 0 ? `${label} bersih` : `${label} keluar dengan kode ${child.status}`;
  if (child.error) { status = 'FAIL'; summary = `${label} gagal dijalankan: ${child.error.message}`; }
  // 127 = binari tidak ada. Di direktori yang devDependency-nya belum terpasang,
  // tsc/eslint/vitest hilang - itu masalah lingkungan, bukan temuan bug.
  else if (child.status === 127) { summary = `${label}: perintahnya tidak ditemukan - devDependency belum terpasang, jalankan \`npm ci\``; }
  if (parse && !child.error) {
    const parsed = parse({ status: child.status ?? -1, output, defaultStatus: status });
    if (parsed?.status) status = parsed.status;
    if (parsed?.summary) summary = parsed.summary;
  }
  record({ id, stage, label, status, summary, durationMs, detail: tail(output), logFile: `logs/${stage}-${id}.log` });
  return child;
}

// ------------------------------------ stage 0: segarkan worktree ke origin/main
function syncWorktree() {
  if (insideProductionCheckout) {
    record({ id: 'guard', stage: 'sync', label: 'sync worktree', status: 'FAIL', durationMs: 0, detail: '',
      summary: `menolak sync di checkout produksi ${PRODUCTION_CHECKOUT} - \`git reset --hard\` di sana membuang apa pun yang belum di-commit` });
    return;
  }
  runCommand({ id: 'fetch', stage: 'sync', label: 'git fetch origin main', command: 'git', args: ['fetch', '--prune', 'origin', 'main'] });
  // Detached HEAD, bukan branch: `main` sudah di-checkout di /opt/sahamlens/app dan
  // git menolak branch yang sama dipegang dua worktree.
  runCommand({ id: 'checkout', stage: 'sync', label: 'reset ke origin/main', command: 'git', args: ['checkout', '--detach', '--force', 'origin/main'] });
  runCommand({ id: 'clean', stage: 'sync', label: 'bersihkan sisa build', command: 'git', args: ['clean', '-xdf', '--exclude=node_modules', '--exclude=reports'] });
  // CLAUDE.md §4: package.json berubah tanpa `npm ci` menghasilkan galat "Can't
  // resolve" yang terbaca seolah kodenya yang rusak.
  runCommand({ id: 'npm-ci', stage: 'sync', label: 'npm ci', command: 'npm', args: ['ci'] });
}

// ----------------------------------------------------- stage 1: pembaruan data

/** Method HTTP yang benar-benar di-export sebuah route.ts. */
function exportedMethods(source) {
  return new Set(
    [...source.matchAll(/export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
      .map((match) => match[1]),
  );
}

async function refreshData() {
  const secret = process.env.CRON_SECRET;
  const routeRoot = path.join(ROOT, 'app', 'api', 'cron');
  const knownRoutes = new Map(
    fs.readdirSync(routeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(routeRoot, entry.name, 'route.ts')))
      .map((entry) => [
        `/api/cron/${entry.name}`,
        exportedMethods(fs.readFileSync(path.join(routeRoot, entry.name, 'route.ts'), 'utf8')),
      ]),
  );

  if (!secret) {
    record({
      id: 'cron-secret', stage: 'data', label: 'CRON_SECRET', durationMs: 0, detail: '',
      status: dryRun ? 'SKIP' : 'FAIL',
      summary: 'CRON_SECRET kosong - jalankan dengan --env-file=/opt/sahamlens/app/.env.production, atau --no-data kalau memang hanya mau audit',
    });
    if (!dryRun) return;
  }

  for (const job of config.dataRefresh ?? []) {
    const id = job.path.split('/').pop();
    const method = String(job.method ?? 'GET').toUpperCase();
    const routeMethods = knownRoutes.get(job.path);
    if (!routeMethods) {
      record({ id, stage: 'data', label: job.path, status: 'FAIL', durationMs: 0, detail: '',
        summary: 'route tidak ada di app/api/cron - config/weekly-maintenance.json drift dari kode' });
      continue;
    }
    // Menembak method yang tidak di-export membalas 405, dan 405 di laporan terbaca
    // seolah endpointnya menolak - padahal configlah yang salah. Tolak di depan.
    if (!routeMethods.has(method)) {
      const available = [...routeMethods].sort().join(', ') || 'tidak ada handler';
      record({ id, stage: 'data', label: job.path, status: 'FAIL', durationMs: 0, detail: '',
        summary: `route tidak meng-export ${method} (yang ada: ${available}) - perbaiki "method" di config/weekly-maintenance.json` });
      continue;
    }
    if (dryRun) {
      record({ id, stage: 'data', label: job.path, status: 'SKIP', summary: `dry-run: ${method} ${baseUrl}${job.path}`, durationMs: 0, detail: '' });
      continue;
    }
    const begin = Date.now();
    try {
      const response = await fetch(`${baseUrl}${job.path}`, {
        method,
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout((job.timeoutSec ?? 300) * 1000),
      });
      const body = await response.text();
      fs.writeFileSync(path.join(logDir, `data-${id}.log`), body || '(body kosong)', 'utf8');
      const durationMs = Date.now() - begin;
      let status = response.ok ? 'PASS' : 'FAIL';
      let summary = response.ok ? `HTTP ${response.status}` : `HTTP ${response.status} - job menolak/gagal`;
      // Job yang dilewati guard konkurensi bukan kegagalan, tapi datanya juga tidak
      // ikut segar - jangan dilaporkan hijau, nanti dikira sudah ter-refresh.
      if (response.ok && /"status"\s*:\s*"SKIPPED"|job_already_running/i.test(body)) {
        status = 'WARN';
        summary = `HTTP ${response.status} tapi job dilewati (kemungkinan masih berjalan) - data belum tentu segar`;
      }
      record({ id, stage: 'data', label: job.path, status, summary, durationMs, detail: tail(body, 12), logFile: `logs/data-${id}.log`, reason: job.reason });
    } catch (error) {
      record({ id, stage: 'data', label: job.path, status: 'FAIL', durationMs: Date.now() - begin, detail: '',
        summary: `tidak bisa dihubungi: ${error instanceof Error ? error.message : String(error)}`, reason: job.reason });
    }
  }

  runCommand({ id: 'integrity', stage: 'data', label: 'audit integritas produksi (migrasi, kesegaran data, evidence PIT)', command: 'npm', args: ['run', '--silent', 'audit:integrity'] });
}

// -------------------------------------------------------- stage 2: keamanan
function checkSecurity() {
  runCommand({
    id: 'npm-audit', stage: 'security', label: `npm audit (level ${config.security?.npmAuditLevel ?? 'high'})`,
    command: 'npm', args: ['audit', '--omit=dev', `--audit-level=${config.security?.npmAuditLevel ?? 'high'}`, '--json'],
    softFail: config.security?.failOnVulnerability === false,
    parse: ({ output, defaultStatus }) => {
      try {
        // `metadata.vulnerabilities` juga memuat kunci `total`; menjumlahkan seluruh
        // nilai berarti menghitung dua kali, jadi severity-nya disebut eksplisit.
        const report = JSON.parse(output.slice(output.indexOf('{')));
        const v = report.metadata?.vulnerabilities ?? {};
        const severities = ['critical', 'high', 'moderate', 'low', 'info'];
        const total = severities.reduce((sum, key) => sum + Number(v[key] || 0), 0);
        const breakdown = severities.filter((key) => Number(v[key]) > 0).map((key) => `${v[key]} ${key}`).join(', ');
        return total === 0
          ? { status: 'PASS', summary: 'tidak ada kerentanan pada dependency produksi' }
          : { status: defaultStatus === 'PASS' ? 'WARN' : defaultStatus, summary: `${total} kerentanan dependency produksi (${breakdown})` };
      } catch { return null; }
    },
  });

  // Secret yang ikut ter-commit tidak akan pernah tertangkap npm audit.
  const begin = Date.now();
  const tracked = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  const leaked = (tracked.stdout ?? '').split('\n')
    .filter((file) => /(^|\/)\.env($|\.)/.test(file) && !/\.env\.example$/.test(file));
  record({
    id: 'tracked-secrets', stage: 'security', label: 'berkas .env ter-commit', durationMs: Date.now() - begin,
    status: leaked.length ? 'FAIL' : 'PASS',
    summary: leaked.length ? `${leaked.length} berkas env masuk git: ${leaked.join(', ')}` : 'tidak ada berkas .env yang masuk git',
    detail: leaked.join('\n'),
  });

  // Izin berkas env: 0600. Kalau bisa dibaca grup/other, satu akun VPS bocor sama
  // saja dengan seluruh kunci produksi bocor.
  const begin2 = Date.now();
  const envRoots = [ROOT, PRODUCTION_CHECKOUT].filter((dir, index, all) => fs.existsSync(dir) && all.indexOf(dir) === index);
  const envFiles = envRoots.flatMap((dir) => fs.readdirSync(dir)
    .filter((file) => /^\.env($|\.)/.test(file) && file !== '.env.example')
    .map((file) => path.join(dir, file)));
  const loose = envFiles.filter((file) => (fs.statSync(file).mode & 0o077) !== 0);
  record({
    id: 'env-permissions', stage: 'security', label: 'izin berkas .env', durationMs: Date.now() - begin2,
    status: loose.length ? 'WARN' : 'PASS',
    summary: loose.length ? `${loose.length} berkas env dapat dibaca grup/other: ${loose.join(', ')} - chmod 600` : `${envFiles.length} berkas env memakai izin ketat`,
    detail: loose.join('\n'),
  });
}

// ------------------------------- stage 3: gerbang produksi (bug + optimasi)
function checkQuality() {
  if (insideProductionCheckout) {
    record({
      id: 'verify-prod', stage: 'quality', label: 'npm run verify:prod', status: 'FAIL', durationMs: 0, detail: '',
      summary: `ditolak di checkout produksi ${PRODUCTION_CHECKOUT} - next build akan menimpa .next/ yang sedang dilayani; jalankan job ini dari worktree perawatan`,
    });
    return;
  }
  // Satu perintah, bukan salinan daftarnya: verify:prod adalah gerbang yang sama
  // yang dipakai CI dan deploy - 12 audit + typecheck + lint + test + build + bundle.
  runCommand({ id: 'verify-prod', stage: 'quality', label: 'npm run verify:prod', command: 'npm', args: ['run', 'verify:prod'] });
}

// ------------------------------------------------ stage 4: umur dependency
function checkDeps() {
  runCommand({
    id: 'outdated', stage: 'deps', label: 'dependency tertinggal', command: 'npm', args: ['outdated', '--json'], softFail: true,
    parse: ({ output }) => {
      try {
        const data = JSON.parse(output.slice(output.indexOf('{')) || '{}');
        const names = Object.keys(data);
        const majors = names.filter((name) => String(data[name].current ?? '').split('.')[0] !== String(data[name].latest ?? '').split('.')[0]);
        return names.length === 0
          ? { status: 'PASS', summary: 'semua dependency mutakhir' }
          : { status: 'WARN', summary: `${names.length} dependency tertinggal (${majors.length} beda versi mayor)` };
      } catch { return { status: 'WARN', summary: 'keluaran npm outdated tidak terbaca - lihat log' }; }
    },
  });
}

// ------------------------------------------------------------------- laporan
function writeReport() {
  const finishedAt = new Date();
  const counts = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  for (const entry of results) counts[entry.status] += 1;
  const verdict = counts.FAIL > 0 ? 'FAIL' : (counts.WARN > 0 ? 'WARN' : 'PASS');

  const payload = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    verdict,
    counts,
    stages: activeStages,
    dataRefreshEnabled: dataEnabled,
    checkout: ROOT,
    commit: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() ?? null,
    baseUrl,
    dryRun,
    steps: results,
  };

  const lines = [
    `# Perawatan mingguan SahamLens - ${startedAt.toISOString().slice(0, 10)}`,
    '',
    `- Verdict: **${verdict}** (${counts.PASS} PASS, ${counts.WARN} WARN, ${counts.FAIL} FAIL, ${counts.SKIP} SKIP)`,
    `- Mulai: ${startedAt.toISOString()} - selesai: ${finishedAt.toISOString()} (${Math.round((finishedAt - startedAt) / 1000)} detik)`,
    `- Checkout: \`${ROOT}\` @ ${payload.commit ?? '?'}`,
    `- Stage: ${activeStages.join(', ')}${dataEnabled ? '' : ' (pembaruan data dimatikan)'}`,
    '',
    '| Stage | Langkah | Status | Ringkasan | Durasi |',
    '| --- | --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.stage} | ${r.id} | ${r.status} | ${r.summary.replace(/\|/g, '\\|')} | ${Math.round(r.durationMs / 1000)}s |`),
    '',
    '## Yang perlu ditindak',
    '',
  ];
  const actionable = results.filter((r) => r.status === 'FAIL' || r.status === 'WARN');
  if (!actionable.length) lines.push('Tidak ada. Semua langkah lolos.', '');
  for (const item of actionable) {
    lines.push(`### ${item.status} - ${item.stage}/${item.id}`, '', item.summary, '');
    if (item.reason) lines.push(`Kenapa langkah ini ada: ${item.reason}`, '');
    if (item.detail) lines.push('```', item.detail, '```', '');
    if (item.logFile) lines.push(`Log lengkap: \`${item.logFile}\``, '');
  }

  if (!dryRun) {
    fs.writeFileSync(path.join(reportDir, 'report.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(reportDir, 'report.md'), `${lines.join('\n')}\n`, 'utf8');
    prune();
  }

  say('');
  say(`[maintenance] VERDICT ${verdict} - ${counts.PASS} PASS / ${counts.WARN} WARN / ${counts.FAIL} FAIL / ${counts.SKIP} SKIP`);
  if (!dryRun) say(`[maintenance] laporan: ${path.relative(ROOT, reportDir)}/report.md`);
  if (jsonOnly) console.log(JSON.stringify(payload, null, 2));
  return verdict;
}

/** Simpan hanya N laporan terakhir supaya disk VPS tidak pelan-pelan penuh. */
function prune() {
  const base = path.resolve(ROOT, config.reportDir ?? 'reports/weekly-maintenance');
  const dirs = fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const dir of dirs.slice(0, Math.max(0, dirs.length - keepReports))) {
    fs.rmSync(path.join(base, dir), { recursive: true, force: true });
  }
}

// ----------------------------------------------------------------- eksekusi
say(`[maintenance] mulai ${startedAt.toISOString()} - stage: ${activeStages.join(', ')}${dryRun ? ' (DRY RUN)' : ''}`);
if (activeStages.includes('sync')) syncWorktree();
if (activeStages.includes('data')) {
  if (dataEnabled) await refreshData();
  else record({ id: 'data', stage: 'data', label: 'pembaruan data', status: 'SKIP', summary: 'dimatikan lewat --no-data', durationMs: 0, detail: '' });
}
if (activeStages.includes('security')) checkSecurity();
if (activeStages.includes('quality')) checkQuality();
if (activeStages.includes('deps')) checkDeps();

const verdict = writeReport();
process.exit(verdict === 'FAIL' || (failOnWarn && verdict === 'WARN') ? 1 : 0);
