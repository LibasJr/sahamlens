#!/usr/bin/env node
// Pengawas kebasian bukti input makro (Rapat Dewan Gubernur BI, yield SBN, ERP, sasaran inflasi).
//
// KENAPA ADA. Bukti makro di macro_input_evidence diisi MANUAL: tidak ada job terjadwal yang
// menyentuhnya (job `macro` hanya me-refresh USD_IDR + pre-warm cache). Akibatnya BI-Rate
// tertahan di bukti RDG 22 Juli 2026 padahal RDG 19 Agustus dan 22-23 September 2026 sudah
// memutuskan 5,75% - dilaporkan operator 2026-09-24 ("menu macro belum update data").
// Skrip ini TIDAK menulis nilai apa pun: hanya memberi tahu saat bukti sudah terlalu tua.
//
// Data yang dibaca hanya dari database produksi (tidak ada nilai karangan, tidak ada dummy).
import { Client } from 'pg';

const POLICY = [
  { key: 'BI_RATE_PCT', maxAgeDays: 45, level: 'CRITICAL', note: 'RDG Bank Indonesia bulanan' },
  { key: 'RISK_FREE_RATE_PCT', maxAgeDays: 75, level: 'CRITICAL', note: 'yield SBN 10Y dari brief bulanan' },
  { key: 'EQUITY_RISK_PREMIUM_PCT', maxAgeDays: 400, level: 'WARN', note: 'dataset risiko negara tahunan' },
  { key: 'INFLATION_TARGET_MID_PCT', maxAgeDays: 400, level: 'WARN', note: 'sasaran inflasi tahunan' },
  { key: 'INFLATION_TARGET_UPPER_PCT', maxAgeDays: 400, level: 'WARN', note: 'sasaran inflasi tahunan' },
];

function daysSince(dateString) {
  const then = new Date(`${dateString}T00:00:00Z`).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86_400_000);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[macro-watchdog] DATABASE_URL wajib diisi (EnvironmentFile .env.production)');
    process.exit(2);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15_000 });
  await client.connect();
  let rows;
  try {
    ({ rows } = await client.query(
      `select distinct on (input_key) input_key, value_pct,
                to_char(usable_from_date, 'YYYY-MM-DD') as usable_date,
                source_name, source_url
         from macro_input_evidence
        where usable_from_date <= current_date
        order by input_key, usable_from_date desc`,
    ));
  } finally {
    await client.end();
  }

  const byKey = new Map(rows.map((row) => [row.input_key, row]));
  let critical = 0;
  let warn = 0;

  console.log('[macro-watchdog] bukti makro terbaru yang terbaca hari ini:');
  for (const policy of POLICY) {
    const row = byKey.get(policy.key);
    if (!row) {
      critical += 1;
      console.log(`  HILANG   ${policy.key} - belum ada bukti sama sekali (${policy.note})`);
      continue;
    }
    const age = daysSince(row.usable_date);
    const stale = age > policy.maxAgeDays;
    if (stale && policy.level === 'CRITICAL') critical += 1;
    else if (stale) warn += 1;
    const tag = stale ? (policy.level === 'CRITICAL' ? 'BASI!!' : 'BASI  ') : 'SEGAR ';
    console.log(
      `  ${tag} ${policy.key.padEnd(26)} ${String(row.value_pct).padStart(7)}% · berlaku ${row.usable_date} · ${age} hari (batas ${policy.maxAgeDays}) · ${row.source_name ?? 'tanpa sumber'}`,
    );
  }

  console.log(`[macro-watchdog] VERDICT ${critical ? 'BASI' : 'SEGAR'} - ${critical} kritis / ${warn} peringatan`);
  if (critical) {
    console.error(
      '[macro-watchdog] Bukti makro kritis sudah terlalu tua. Tambahkan baris bukti resmi baru ke ' +
        'macro_input_evidence (tanggal keputusan resmi, nilai, dan URL sumber), lalu jalankan ulang pengawas ini.',
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`[macro-watchdog] gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});