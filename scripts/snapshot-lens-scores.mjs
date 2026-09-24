#!/usr/bin/env node

/**
 * Rekam snapshot skor LensRadar sekali pakai per sesi (append-only).
 *
 * KENAPA. `lens_radar_history` di-upsert dengan kunci yang memuat `score_config_hash`,
 * jadi setiap hitungan ulang menambah baris baru. Audit 2026-09-24: 3.436.114 baris untuk
 * 1.012.464 pasangan sesi-emiten unik. Arsip karena itu tidak bisa membuktikan "skor apa
 * yang ditampilkan produk pada sesi itu" - yang tersimpan adalah hasil hitungan terakhir.
 *
 * Skrip ini mengambil SATU materialisasi terbaru per (ticker, date) lalu menuliskannya ke
 * `lens_score_snapshot` dengan `on conflict do nothing`. Baris yang sudah ada TIDAK PERNAH
 * berubah, sehingga snapshot berikutnya menjadi bukti point-in-time yang tidak bisa digeser.
 *
 * Sifat: idempoten, tidak menghapus, tidak memperbarui, tidak menyentuh lens_radar_history.
 *
 * Usage:
 *   node scripts/snapshot-lens-scores.mjs                # sesi terakhir
 *   node scripts/snapshot-lens-scores.mjs --date 2026-09-24
 *   node scripts/snapshot-lens-scores.mjs --lookback 5   # 5 sesi terakhir yang belum terekam
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Module from 'node:module';
import fs from 'node:fs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function installTypeScriptRequireHook(rootDir = repoRoot) {
  const ts = require('typescript');
  const previousTs = Module._extensions['.ts'];
  const previousResolve = Module._resolveFilename;
  const rootWithSep = `${rootDir}${path.sep}`;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (typeof request === 'string' && request.startsWith('@/')) {
      return previousResolve.call(this, path.join(rootWithSep, request.slice(2)), parent, isMain, options);
    }
    return previousResolve.call(this, request, parent, isMain, options);
  };
  Module._extensions['.ts'] = function (module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    });
    module._compile(output.outputText, filename);
  };
  return () => {
    Module._resolveFilename = previousResolve;
    if (previousTs) Module._extensions['.ts'] = previousTs;
    else delete Module._extensions['.ts'];
  };
}

const args = process.argv.slice(2);
const dateArgIndex = args.indexOf('--date');
const explicitDate = dateArgIndex >= 0 ? args[dateArgIndex + 1] : null;
const lookbackIndex = args.indexOf('--lookback');
const lookback = lookbackIndex >= 0 ? Math.max(1, Number.parseInt(args[lookbackIndex + 1] ?? '1', 10)) : 1;

async function main() {
  const restore = installTypeScriptRequireHook();
  const { queryReadWithRetry, pool } = require(path.join(repoRoot, 'shared/database/postgres.client.ts'));

  const datesRes = await queryReadWithRetry(
    explicitDate
      ? `select $1::date::text as date`
      : `select distinct date::text as date from lens_radar_history order by date desc limit $1`,
    explicitDate ? [explicitDate] : [lookback]
  );
  const dates = datesRes.rows.map((row) => row.date);
  if (!dates.length) throw new Error('Tidak ada sesi di lens_radar_history.');

  let inserted = 0;
  let skipped = 0;

  for (const date of dates) {
    // Satu pernyataan INSERT ... ON CONFLICT DO NOTHING: atomik, dan baris yang sudah
    // terekam tidak pernah berubah (satu baris per ticker+tanggal).
    const res = await pool.query(
      `with terbaru as (
         select distinct on (ticker)
                ticker, date, lens_score, technical_score, fundamental_score, flow_score,
                coverage_pct, score_version, score_config_hash, universe_version,
                calculation_timestamp
           from lens_radar_history
          where date = $1::date
          order by ticker, calculation_timestamp desc nulls last, updated_at desc
       )
       insert into lens_score_snapshot (
         ticker, date, lens_score, technical_score, fundamental_score, flow_score,
         coverage_pct, score_version, score_config_hash, universe_version,
         source_calculation_timestamp
       )
       select ticker, date, lens_score, technical_score, fundamental_score, flow_score,
              coverage_pct, score_version, score_config_hash, universe_version,
              calculation_timestamp
         from terbaru
       on conflict (ticker, date) do nothing
       returning 1 as ditulis`,
      [date]
    );
    const captured = res.rowCount ?? 0;
    const totalRes = await queryReadWithRetry(
      `select count(distinct ticker)::int as jumlah from lens_radar_history where date = $1::date`,
      [date]
    );
    const total = totalRes.rows[0]?.jumlah ?? 0;
    inserted += captured;
    skipped += Math.max(0, total - captured);
    console.log(
      `${date}: ditulis ${captured.toLocaleString('id-ID')} baris baru, dilewati ${Math.max(0, total - captured).toLocaleString('id-ID')} (sudah ada di snapshot), sumber ${total.toLocaleString('id-ID')} emiten`
    );
  }

  const sum = await queryReadWithRetry(
    `select count(*)::int as baris, count(distinct date)::int as sesi, min(date)::text as awal, max(date)::text as akhir,
            count(*) filter (where captured_at > date + interval '2 days')::int as terlambat
       from lens_score_snapshot`
  );
  const s = sum.rows[0];
  console.log(
    `snapshot: ${s.baris.toLocaleString('id-ID')} baris · ${s.sesi} sesi · ${s.awal} → ${s.akhir} · ditulis >2 hari setelah sesinya: ${s.terlambat.toLocaleString('id-ID')}`
  );
  console.log(`sesi ini: ditulis ${inserted.toLocaleString('id-ID')} · dilewati ${skipped.toLocaleString('id-ID')}`);
  restore();
}

main().catch((error) => {
  console.error('[snapshot-skor] gagal:', error?.message ?? error);
  process.exitCode = 1;
});