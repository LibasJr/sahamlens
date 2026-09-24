#!/usr/bin/env node
/**
 * Penjaga cakupan pengetahuan LensAI (chat).
 *
 * Tujuan: LensAI wajib mengenali SETIAP menu/fitur yang ada di aplikasi
 * (Sidebar + MobileNav), tanpa terkecuali. Skrip ini membaca daftar menu dari
 * kode navigasi lalu memastikan setiap nama menu (atau aliasnya) disebut di
 * basis pengetahuan `modules/ai/knowledge/sahamlens-knowledge.ts`.
 *
 * Gagal (exit 1) bila ada menu yang tidak terdokumentasi, sehingga penambahan
 * fitur baru tidak bisa lolos CI tanpa menambah pengetahuannya untuk LensAI.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const KB_FILE = 'modules/ai/knowledge/sahamlens-knowledge.ts';
const NAV_FILES = ['components/Sidebar.tsx', 'components/MobileNav.tsx'];

/** Nama menu di UI yang di basis pengetahuan ditulis dengan istilah lain. */
const ALIASES = {
  'LensMarket': ['kondisi pasar makro', 'market breadth', 'market regime'],
  'LensRadar': ['breakout radar', 'daily picks'],
  'LensTechnical': ['analisis teknikal', 'lensconsensus'],
  'LensFundamental': ['rasio finansial'],
  'LensScanner': ['penyaringan multi-faktor', 'screener'],
  'LensWatch': ['watchlist'],
  'LensAI Research': ['lensai'],
  'Ownership Flow': ['arus kepemilikan', 'komposisi kepemilikan'],
  'Corporate Calendar': ['kalender', 'aksi korporasi'],
  'News & Sentiment': ['berita'],
  'Risk Matrix': ['simulasi stres'],
  'Risk Calculator': ['kalkulator ukuran posisi', 'position sizing'],
  'Akun Demo': ['paper trading', 'portofolio virtual'],
  'Impor Histori Fundamental': ['impor histori fundamental', 'upload csv'],
  'Infographic Studio': ['infographic studio'],
  'LensScore Studio': ['lensscore'],
};

const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Ambil entri menu { name, path } dari berkas navigasi. */
function parseMenuEntries(source) {
  const entries = [];
  const re = /name:\s*'([^']+)'[\s\S]{0,400}?path:\s*'([^']*)'/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    entries.push({ name: match[1], route: match[2] });
  }
  return entries;
}

/** Halaman admin yang tidak muncul di Sidebar (mis. sub-halaman) tetap wajib dikenali. */
async function collectAdminRoutes() {
  const routes = [];
  const walk = async (dir) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.name !== 'page.tsx') continue;
      const relative = path.relative(path.join(ROOT, 'app'), full);
      const segments = relative.split(path.sep).slice(0, -1).filter((s) => !/^\(.+\)$/.test(s));
      if (segments[0] !== 'admin') continue;
      routes.push('/' + segments.join('/'));
    }
  };
  try {
    await walk(path.join(ROOT, 'app'));
  } catch {
    // tidak ada folder admin -> tidak ada yang diperiksa
  }
  return routes;
}

/** Label ramah untuk sebuah rute admin, dipakai bila menu tak ada di Sidebar. */
const ROUTE_LABELS = {
  '/admin/broker-summary': 'Ringkasan Broker',
  '/admin/broker-eod': 'Broker End of Day',
  '/admin/tpcl-validation': 'Validasi TP/CL',
  '/admin/intraday-validation': 'Validasi Intraday',
  '/admin/factor-scan': 'Pemindaian Faktor',
  '/admin/beta-pages': 'Halaman Beta',
  '/admin/infra-studio': 'Infographic Studio',
  '/admin/data-integrity': 'Pemeriksaan Harga Penutupan',
};

async function main() {
  const knowledgePath = path.join(ROOT, KB_FILE);
  const knowledge = normalize(await fs.readFile(knowledgePath, 'utf8'));

  const menuEntries = [];
  for (const file of NAV_FILES) {
    try {
      const source = await fs.readFile(path.join(ROOT, file), 'utf8');
      menuEntries.push(...parseMenuEntries(source));
    } catch {
      // berkas navigasi tidak ada -> lewati
    }
  }

  const seen = new Set();
  const items = [];
  for (const entry of menuEntries) {
    const key = `${entry.name}|${entry.route}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(entry);
  }
  for (const route of await collectAdminRoutes()) {
    if (items.some((i) => i.route === route)) continue;
    const label = ROUTE_LABELS[route] ?? route.split('/').pop().replace(/-/g, ' ');
    const key = `${label}|${route}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ name: label, route });
  }

  const missing = [];
  for (const item of items) {
    const name = normalize(item.name);
    const candidates = [name, ...(ALIASES[item.name] ?? []).map(normalize)];
    const documented = candidates.some((c) => c.length > 2 && knowledge.includes(c));
    if (!documented) missing.push(item);
  }

  console.log(`[audit:chat-knowledge] menu diperiksa: ${items.length}`);
  if (missing.length === 0) {
    console.log('[audit:chat-knowledge] PASS - semua menu dikenali basis pengetahuan LensAI.');
    return;
  }
  console.log(`[audit:chat-knowledge] FAIL - ${missing.length} menu belum ada di basis pengetahuan LensAI:`);
  for (const item of missing) {
    console.log(`  - ${item.name} (${item.route || 'tanpa rute'})`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('[audit:chat-knowledge] galat tak terduga:', error);
  process.exitCode = 1;
});