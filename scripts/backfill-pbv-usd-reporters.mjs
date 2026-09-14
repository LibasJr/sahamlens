#!/usr/bin/env node
/**
 * Backfill PBV untuk emiten pelapor USD di `fundamental_history`.
 *
 * ===================================================================================
 * APA YANG DIPERBAIKI
 * ===================================================================================
 * `defaultKeyStatistics.priceToBook` Yahoo untuk emiten pelapor USD membandingkan harga
 * IDR dengan nilai buku USD. Hasilnya bukan rasio melainkan angka sebesar KURS:
 *
 *   ADRO 16.500   AADI 28.563   AMMN 63.947   BREN 648.000
 *
 * Terukur: 1.163 baris di 38 emiten. Penulisan barunya sudah ditutup (#413); berkas ini
 * membereskan baris yang terlanjur tersimpan.
 *
 * ===================================================================================
 * KENAPA DIBAGI KURS, BUKAN DIHITUNG ULANG DARI NILAI BUKU
 * ===================================================================================
 * Yang tersimpan adalah  raw = harga_IDR / bv_USD.
 * Yang benar adalah      pbv = harga_IDR / (bv_USD * kurs).
 * Maka                   pbv = raw / kurs  -  tepat, tanpa perlu tahu harga atau bv.
 *
 * Ini penting untuk arsip point-in-time: menghitung ulang dari `bookValue` HARI INI akan
 * memasukkan nilai buku yang belum terbit pada tanggal baris itu - look-ahead. Membagi
 * kurs hanya memakai angka yang sudah ada di baris tersebut plus kurs pada tanggal yang
 * sama, jadi sifat point-in-time-nya utuh.
 *
 * ===================================================================================
 * PENJAGA
 * ===================================================================================
 * - Dry-run adalah DEFAULT. Menulis butuh --apply eksplisit.
 * - Hanya emiten yang DIVERIFIKASI pelapor USD dari Yahoo saat dijalankan. EURO.JK punya
 *   PBV 69x tapi pelapor IDR - itu emiten mahal, bukan bug, dan tidak boleh disentuh.
 * - Kurs diambil per tanggal baris, bukan kurs hari ini.
 * - Hasil koreksi yang masih di luar nalar TIDAK ditulis; baris itu dilewati dan
 *   dilaporkan, karena berarti asumsinya tidak berlaku untuk baris tersebut.
 */
import process from 'node:process';
import 'dotenv/config';
import pg from 'pg';
import YahooFinance from 'yahoo-finance2';

const APPLY = process.argv.includes('--apply');
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/** Batas yang sama dengan gerbang penulisan. */
const PBV_MAX = 1000;
const PBV_MIN = 0;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[backfill] DATABASE_URL tidak diset.');
    process.exit(2);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const suspect = await pool.query(
    `SELECT ticker, observed_date, pbv::float AS pbv
     FROM fundamental_history
     WHERE pbv > $1
     ORDER BY ticker, observed_date`,
    [PBV_MAX]
  );

  if (suspect.rows.length === 0) {
    console.log('[backfill] tidak ada baris di atas batas - tidak ada yang dikerjakan.');
    await pool.end();
    return;
  }

  const tickers = [...new Set(suspect.rows.map((r) => r.ticker))];
  console.log(`[backfill] kandidat: ${suspect.rows.length} baris, ${tickers.length} emiten`);

  // Verifikasi mata uang pelaporan dari sumber, bukan dari daftar hardcoded.
  const usdReporters = new Set();
  for (const t of tickers) {
    try {
      const qs = await yf.quoteSummary(t, { modules: ['financialData', 'price'] });
      if (qs?.price?.currency === 'IDR' && qs?.financialData?.financialCurrency === 'USD') {
        usdReporters.add(t);
      } else {
        console.log(`[backfill] LEWAT ${t}: pelapor ${qs?.financialData?.financialCurrency ?? '?'}, bukan USD - nilainya mungkin memang tinggi`);
      }
    } catch (err) {
      console.log(`[backfill] LEWAT ${t}: gagal verifikasi mata uang (${String(err?.message).slice(0, 40)})`);
    }
  }
  console.log(`[backfill] terverifikasi pelapor USD: ${usdReporters.size}/${tickers.length}`);

  const targets = suspect.rows.filter((r) => usdReporters.has(r.ticker));
  if (targets.length === 0) {
    console.log('[backfill] tidak ada baris yang memenuhi syarat.');
    await pool.end();
    return;
  }

  // Kurs harian sekali ambil, lalu dipetakan per tanggal.
  const dates = targets.map((r) => new Date(r.observed_date));
  const from = new Date(Math.min(...dates));
  const to = new Date(Math.max(...dates));
  from.setDate(from.getDate() - 7);
  to.setDate(to.getDate() + 2);

  const chart = await yf.chart('IDR=X', {
    period1: from.toISOString().slice(0, 10),
    period2: to.toISOString().slice(0, 10),
    interval: '1d',
  });

  const rateByDate = new Map();
  for (const q of chart.quotes) {
    if (q.close) rateByDate.set(q.date.toISOString().slice(0, 10), q.close);
  }
  const sortedRateDates = [...rateByDate.keys()].sort();
  console.log(`[backfill] kurs harian: ${rateByDate.size} bar (${sortedRateDates[0]} .. ${sortedRateDates[sortedRateDates.length - 1]})`);

  /** Kurs pada tanggal itu, atau hari bursa terakhir SEBELUMNYA. Tidak pernah sesudah:
   * memakai kurs masa depan pada baris historis adalah look-ahead. */
  function rateFor(dateKey) {
    if (rateByDate.has(dateKey)) return rateByDate.get(dateKey);
    let best = null;
    for (const d of sortedRateDates) {
      if (d <= dateKey) best = rateByDate.get(d);
      else break;
    }
    return best;
  }

  const updates = [];
  const skipped = [];
  for (const row of targets) {
    // `observed_date` bertipe timestamptz: nilai tersimpan 2026-08-06T17:00:00Z adalah
    // 7 Agustus waktu Jakarta. `toISOString().slice(0,10)` memberi 2026-08-06 - meleset
    // satu hari, dan UPDATE-nya tidak cocok dengan baris mana pun (terukur: 298 baris
    // tidak tersentuh). Kunci tanggal harus dihitung di zona waktu bursa.
    const dateKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(row.observed_date));

    const rate = rateFor(dateKey);
    if (!rate) {
      skipped.push({ ...row, why: `kurs tidak tersedia untuk ${dateKey}` });
      continue;
    }
    const corrected = row.pbv / rate;
    if (!Number.isFinite(corrected) || corrected <= PBV_MIN || corrected > PBV_MAX) {
      skipped.push({ ...row, why: `hasil koreksi ${corrected?.toFixed?.(3)} tetap di luar nalar` });
      continue;
    }
    updates.push({
      ticker: row.ticker,
      dateKey,
      observedDate: row.observed_date,
      before: row.pbv,
      after: corrected,
      rate,
    });
  }

  console.log(`[backfill] siap dikoreksi: ${updates.length}, dilewati: ${skipped.length}`);
  for (const s of skipped.slice(0, 10)) {
    console.log(`  LEWAT ${s.ticker} ${new Date(s.observed_date).toISOString().slice(0, 10)}: ${s.why}`);
  }

  const sample = updates.slice(0, 12);
  console.log('[backfill] contoh koreksi:');
  for (const u of sample) {
    console.log(`  ${u.ticker.padEnd(9)} ${u.dateKey}  ${u.before.toFixed(0).padStart(8)} -> ${u.after.toFixed(3).padStart(8)}  (kurs ${u.rate.toFixed(0)})`);
  }

  if (!APPLY) {
    console.log('\n[backfill] DRY-RUN. Tidak ada yang ditulis. Jalankan dengan --apply untuk menerapkan.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let written = 0;
  try {
    await client.query('BEGIN');
    for (const u of updates) {
      // Pencocokan lewat (ticker, observed_date) + syarat "masih mencurigakan", BUKAN
      // kesetaraan nilai. `pbv` bertipe numeric presisi penuh, sedangkan nilai yang
      // dibaca sudah lewat `::float` - `pbv = $4` gagal cocok untuk mayoritas baris
      // (terukur: hanya 269 dari 1135 yang kena). Syarat `pbv > PBV_MAX` menjaga
      // idempotensi: baris yang sudah dikoreksi tidak akan dibagi kurs untuk kedua
      // kalinya kalau skrip dijalankan ulang.
      //
      // `observed_date` dioper sebagai timestamp ASLI dari baris, bukan `$3::date`:
      // kolomnya timestamptz, dan membandingkannya dengan date membuat Postgres
      // menormalkan ke tengah malam zona server - yang tidak pernah sama dengan
      // 17:00:00Z yang tersimpan.
      const res = await client.query(
        `UPDATE fundamental_history
         SET pbv = $1
         WHERE ticker = $2 AND observed_date = $3 AND pbv > $4`,
        [u.after, u.ticker, u.observedDate, PBV_MAX]
      );
      written += res.rowCount ?? 0;
    }
    await client.query('COMMIT');
    console.log(`[backfill] DITERAPKAN: ${written} baris diperbarui.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[backfill] GAGAL, transaksi di-rollback:', err?.message ?? err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[backfill] gagal:', err?.message ?? err);
  process.exit(1);
});
