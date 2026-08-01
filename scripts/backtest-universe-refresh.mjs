// Cari kandidat ticker likuid tambahan dari idx_emiten_900.csv (papan Utama) untuk
// melengkapi 51 ticker seed (disalin dari SCREENER_UNIVERSE di
// modules/market/service/screener.service.ts) jadi 100 ticker universe backtest.
// Dijalankan sekali (atau ulang berkala) secara manual: `node scripts/backtest-universe-refresh.mjs`
// Kandidat harus lolos DUA syarat: (1) rata-rata nilai transaksi harian 3 bulan
// terakhir (buat ranking) DAN (2) rata-rata harga close 3 bulan terakhir >= Rp 200
// (price floor) - supaya saham gorengan/micro-cap murah yang gampang lolos ranking
// nilai transaksi (karena volume besar tapi harga receh) tidak ikut masuk universe
// backtest. Lihat temuan review: CNKO, BTEK, ALKA, APLI, BLTA, AISA, BBRM, SICO,
// SPRE, LABA, COCO sempat lolos sebelum price floor ini ditambahkan.
// Output: scripts/.backtest-universe-candidates.json (49 ticker teratas berdasarkan
// rata-rata nilai transaksi harian 3 bulan terakhir, setelah difilter price floor) -
// salin manual ke modules/backtest/constants/backtest-universe.ts setelah dicek.

import fs from 'fs';

const SEED_TICKERS = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK', 'GOTO.JK', 'ADRO.JK', 'UNTR.JK',
  'ICBP.JK', 'KLBF.JK', 'PGAS.JK', 'PTBA.JK', 'ANTM.JK', 'BRPT.JK', 'INKP.JK', 'INDF.JK', 'ITMG.JK',
  'CPIN.JK', 'UNVR.JK', 'AKRA.JK', 'BRIS.JK', 'SMGR.JK', 'INTP.JK', 'CTRA.JK', 'BSDE.JK', 'SMRA.JK',
  'ISAT.JK', 'EXCL.JK', 'BUKA.JK', 'TOWR.JK', 'TBIG.JK', 'SIDO.JK', 'AMRT.JK', 'MYOR.JK', 'HMSP.JK',
  'GGRM.JK', 'JPFA.JK', 'ARTO.JK', 'BDMN.JK', 'BNGA.JK', 'BBTN.JK', 'MEGA.JK', 'INDY.JK', 'BYAN.JK',
  'HRUM.JK', 'INCO.JK', 'TINS.JK', 'MAPI.JK', 'SILO.JK', 'EMTK.JK',
];

function parseCsv(path) {
  const raw = fs.readFileSync(path, 'utf8').trim().split('\n');
  const header = raw[0].split(',');
  return raw.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    header.forEach((h, i) => { row[h.trim()] = (cols[i] || '').trim(); });
    return row;
  });
}

const MIN_AVG_PRICE = 200;

async function fetchAvgDailyValue(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=3mo&interval=1d`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    let sumValue = 0;
    let sumClose = 0;
    let n = 0;
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null && volumes[i] != null) {
        sumValue += closes[i] * volumes[i];
        sumClose += closes[i];
        n++;
      }
    }
    if (n < 30) return null;
    return { avgDailyValue: sumValue / n, avgClose: sumClose / n };
  } catch {
    return null;
  }
}

async function main() {
  const rows = parseCsv('idx_emiten_900.csv').filter((r) => r.Papan === 'Utama');
  const candidates = [...new Set(rows.map((r) => r.Kode_YFinance).filter((t) => t && !SEED_TICKERS.includes(t)))];

  console.log(`Cek ${candidates.length} kandidat (papan Utama, belum ada di seed 51)...`);
  const results = [];
  const BATCH = 15;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const values = await Promise.all(
      batch.map(async (t) => {
        const stats = await fetchAvgDailyValue(t);
        return stats ? { ticker: t, avgDailyValue: stats.avgDailyValue, avgClose: stats.avgClose } : null;
      })
    );
    results.push(...values.filter((v) => v != null));
    console.log(`  ${Math.min(i + BATCH, candidates.length)}/${candidates.length} dicek, ${results.length} valid sejauh ini`);
    await new Promise((r) => setTimeout(r, 300));
  }

  const belowFloor = results.filter((r) => r.avgClose < MIN_AVG_PRICE);
  const eligible = results.filter((r) => r.avgClose >= MIN_AVG_PRICE);
  console.log(`\n${belowFloor.length} kandidat dibuang karena avg close 3bln < Rp${MIN_AVG_PRICE} (price floor).`);
  console.log(`${eligible.length} kandidat lolos price floor, dari total ${results.length} valid.`);

  eligible.sort((a, b) => b.avgDailyValue - a.avgDailyValue);
  const top49 = eligible.slice(0, 49);

  if (top49.length < 49) {
    console.log(`\nPERINGATAN: hanya ${top49.length} kandidat yang lolos ranking + price floor (target 49).`);
  }

  console.log(`\n=== TOP ${top49.length} KANDIDAT (rata-rata nilai transaksi harian tertinggi, 3 bulan terakhir, avg close >= Rp${MIN_AVG_PRICE}) ===`);
  top49.forEach((r, i) => console.log(`${i + 1}. ${r.ticker} - avg daily value: ${Math.round(r.avgDailyValue).toLocaleString('id-ID')} - avg close: ${Math.round(r.avgClose).toLocaleString('id-ID')}`));

  fs.writeFileSync(
    'scripts/.backtest-universe-candidates.json',
    JSON.stringify(top49.map((r) => r.ticker), null, 2)
  );
  console.log('\nDitulis ke scripts/.backtest-universe-candidates.json - salin 49 ticker ini ke modules/backtest/constants/backtest-universe.ts');
}

main();
