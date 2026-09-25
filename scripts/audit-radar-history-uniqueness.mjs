#!/usr/bin/env node
/**
 * Audit keunikan & sebaran arsip lens_radar_history.
 *
 * KENAPA INI ADA. Audit 2026-09-25 sempat menuduh arsip ini "menyimpan 3,4x materialisasi"
 * (3.436.311 baris vs 1.012.661 pasangan tanggal+emiten) dan mengusulkan unique index baru.
 * Diperiksa langsung ke database: kunci unik (date, ticker, score_version, score_config_hash,
 * universe_version) SUDAH ada dan menutup SEMUA baris. Angka 3,4x itu bukan duplikasi -
 * itu arsip beberapa konfigurasi model dan dua definisi universe secara sengaja, supaya
 * validasi bisa membandingkan versi.
 *
 * Skrip ini menjaga klaim itu tetap benar: kalau suatu saat benar-benar ada duplikat
 * (mis. index terhapus), pemeriksaan ini gagal keras.
 *
 * Jalankan: node scripts/audit-radar-history-uniqueness.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const berkas of ['/opt/sahamlens/app/.env.production', '/opt/sahamlens/app/.env.local', '.env.local', '.env']) {
    try {
      const baris = readFileSync(berkas, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
      if (baris) return baris.slice('DATABASE_URL='.length).trim();
    } catch {
      /* berkas tidak ada - lanjut */
    }
  }
  return null;
}

const url = databaseUrl();
if (!url) {
  console.error('[audit-radar-history] GAGAL: DATABASE_URL tidak ditemukan.');
  process.exit(2);
}

const q = (sql) => execFileSync('psql', [url, '-tAq', '-F', '|', '-c', sql], { encoding: 'utf8' }).trim();

const ringkas = q(`SELECT count(*), count(DISTINCT (date, ticker)),
                          count(DISTINCT (date, ticker, score_version, score_config_hash, universe_version))
                     FROM public.lens_radar_history`).split('|').map(Number);
const [total, unikHariEmiten, unikLengkap] = ringkas;

const indexUnik = q(`SELECT coalesce(string_agg(indexdef, ' ; '), '')
                       FROM pg_indexes
                      WHERE tablename = 'lens_radar_history' AND indexdef ILIKE '%unique%'`);

const sebaran = q(`SELECT score_version, count(*), min(date), max(date)
                     FROM public.lens_radar_history GROUP BY 1 ORDER BY 2 DESC`);

console.log('=== AUDIT ARSIP lens_radar_history ===');
console.log(`baris total          : ${total.toLocaleString('id-ID')}`);
console.log(`pasangan tanggal+emiten: ${unikHariEmiten.toLocaleString('id-ID')}`);
console.log(`baris unik lengkap   : ${unikLengkap.toLocaleString('id-ID')}`);
console.log(`indeks unik          : ${indexUnik || '(TIDAK ADA)'}`);
console.log(`rasio baris/pasangan : ${(total / Math.max(1, unikHariEmiten)).toFixed(2)}x (arsip konfigurasi+universe)`);
console.log('sebaran per score_version:');
for (const baris of sebaran.split('\n').filter(Boolean)) {
  const [versi, jumlah, dari, sampai] = baris.split('|');
  console.log(`  - ${versi}: ${Number(jumlah).toLocaleString('id-ID')} baris (${dari} → ${sampai})`);
}

const masalah = [];
if (total !== unikLengkap) masalah.push(`ADA ${total - unikLengkap} baris duplikat pada kunci unik lengkap`);
if (!indexUnik) masalah.push('tidak ada indeks unik yang menutup (date, ticker, score_version, score_config_hash, universe_version)');

if (masalah.length) {
  console.error('[audit-radar-history] GAGAL:');
  for (const m of masalah) console.error(`  - ${m}`);
  process.exit(1);
}
console.log('[audit-radar-history] PASS: tidak ada duplikat; arsip multi-konfigurasi memang disengaja.');