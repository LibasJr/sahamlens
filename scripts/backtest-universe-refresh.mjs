// Cari kandidat ticker likuid tambahan dari idx_emiten_900.csv untuk melengkapi 51
// ticker seed (disalin dari SCREENER_UNIVERSE di modules/market/service/screener.service.ts)
// jadi TARGET_TOTAL ticker universe backtest.
// Dijalankan sekali (atau ulang berkala) secara manual: `node scripts/backtest-universe-refresh.mjs`
// Kandidat harus lolos DUA syarat: (1) rata-rata nilai transaksi harian 3 bulan
// terakhir (buat ranking) DAN (2) rata-rata harga close 3 bulan terakhir >= Rp 200
// (price floor) - supaya saham gorengan/micro-cap murah yang gampang lolos ranking
// nilai transaksi (karena volume besar tapi harga receh) tidak ikut masuk universe
// backtest. Lihat temuan review: CNKO, BTEK, ALKA, APLI, BLTA, AISA, BBRM, SICO,
// SPRE, LABA, COCO sempat lolos sebelum price floor ini ditambahkan.
//
// Versi sebelumnya menyaring `Papan === 'Utama'` lebih dulu. Filter itu DIBUANG karena
// kolom Papan di CSV ini bukan data papan pencatatan IDX: nilainya berulang siklis
// Pengembangan -> Akselerasi -> Utama mengikuti urutan abjad, cocok 928/928 baris (100%).
// Akibatnya BBCA & BBRI terlabel "Akselerasi", BMRI/UNVR/AALI "Pengembangan", dan filter
// itu efektif cuma mengambil setiap baris ke-3 menurut abjad - bukan saringan kualitas.
// Sekarang ranking likuiditas + price floor yang menyeleksi, dari SELURUH emiten di CSV.
//
// Output: scripts/.backtest-universe-candidates.json (ticker teratas berdasarkan
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
// Ukuran universe backtest yang dituju, termasuk 51 seed. Batas atas praktisnya adalah
// durasi cron precompute harian + ukuran payload Redis, bukan jumlah emiten di bursa.
const TARGET_TOTAL = 200;
// Floor LIKUIDITAS, terpisah dari price floor. Ranking nilai transaksi saja tidak cukup:
// begitu daftar diperlebar ke seluruh emiten, ekor ranking terisi saham yang praktis
// tidak diperdagangkan (FASW & WIKA rata-rata Rp 0/hari, BSWD Rp 124 ribu/hari) - engine
// tetap "membeli" saham itu di backtest padahal di dunia nyata tidak ada lawan transaksi,
// jadi hasilnya bohong. Rp 1 miliar/hari dipilih supaya satu posisi (1/5 modal Rp 100 juta
// = Rp 20 juta) tetap di bawah ~2% nilai transaksi harian, masih wajar untuk dieksekusi.
const MIN_AVG_DAILY_VALUE = 1_000_000_000;
// Cap VOLATILITAS (stdev return harian, disetahunkan) atas data 12 bulan. Dua floor di
// atas menyaring "bisa dibeli?", cap ini menyaring "hasilnya bisa dipercaya?". Tanpa cap,
// satu saham yang kebetulan naik 10x mendominasi seluruh backtest: preset Trend Following
// tercatat +214% padahal hampir semuanya dari SATU posisi BUVA (+910%) - buang BUVA & COIN
// dan angka jujurnya +27%. Median universe 45%/thn; 120% sengaja longgar supaya cuma
// memotong ekor paling ekstrem (COIN 136%, BUVA 132%) tanpa membuang saham momentum wajar.
// JANGAN disetel dengan cara mencari cap yang menghasilkan return tertinggi - hasil per-cap
// tidak monoton (Momentum: +18% -> -12% -> +10% -> -0%), jadi cap yang "menang" cuma
// kebetulan, dan memilih begitu mengulang kesalahan yang cap ini justru mau perbaiki.
const MAX_ANNUAL_VOL_PCT = 120;

// Return harian dari deret close, disetahunkan (252 hari bursa). null kalau datanya
// terlalu pendek untuk bermakna.
function annualVolPct(closes) {
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  if (rets.length < 60) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

async function fetchAvgDailyValue(ticker) {
  // range=1y (bukan 3mo): likuiditas & harga tetap diukur dari 3 bulan terakhir supaya
  // mencerminkan kondisi sekarang, tapi volatilitas butuh jendela setahun penuh agar
  // tidak bias oleh satu kuartal yang kebetulan tenang atau kebetulan liar.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const closesRaw = result.indicators?.quote?.[0]?.close || [];
    const volumesRaw = result.indicators?.quote?.[0]?.volume || [];

    const yearCloses = closesRaw.filter((c) => c != null);
    const vol = annualVolPct(yearCloses);

    const RECENT_DAYS = 63; // ~3 bulan bursa
    const closes = closesRaw.slice(-RECENT_DAYS);
    const volumes = volumesRaw.slice(-RECENT_DAYS);
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
    if (n < 30 || vol == null) return null;
    return { avgDailyValue: sumValue / n, avgClose: sumClose / n, annualVolPct: vol };
  } catch {
    return null;
  }
}

async function main() {
  const rows = parseCsv('idx_emiten_900.csv');
  // Seed ikut DICEK, tidak lagi lolos otomatis. Sebelumnya 51 seed langsung masuk tanpa
  // pernah diverifikasi likuiditasnya, jadi seluruh universe sekarang dipegang standar
  // yang sama. Seed tetap disatukan di sini karena tidak semuanya ada di CSV.
  const candidates = [...new Set([...SEED_TICKERS, ...rows.map((r) => r.Kode_YFinance).filter(Boolean)])];

  console.log(`Cek ${candidates.length} kandidat (seluruh emiten di CSV + ${SEED_TICKERS.length} seed, semuanya diverifikasi)...`);
  const results = [];
  const BATCH = 15;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const values = await Promise.all(
      batch.map(async (t) => {
        const stats = await fetchAvgDailyValue(t);
        return stats ? { ticker: t, ...stats } : null;
      })
    );
    results.push(...values.filter((v) => v != null));
    console.log(`  ${Math.min(i + BATCH, candidates.length)}/${candidates.length} dicek, ${results.length} valid sejauh ini`);
    await new Promise((r) => setTimeout(r, 300));
  }

  const passPrice = (r) => r.avgClose >= MIN_AVG_PRICE;
  const passLiquidity = (r) => r.avgDailyValue >= MIN_AVG_DAILY_VALUE;
  const passVolatility = (r) => r.annualVolPct <= MAX_ANNUAL_VOL_PCT;

  const belowPrice = results.filter((r) => !passPrice(r));
  const belowLiquidity = results.filter((r) => passPrice(r) && !passLiquidity(r));
  const tooVolatile = results.filter((r) => passPrice(r) && passLiquidity(r) && !passVolatility(r));
  const eligible = results.filter((r) => passPrice(r) && passLiquidity(r) && passVolatility(r));

  console.log(`\n${belowPrice.length} kandidat dibuang karena avg close 3bln < Rp${MIN_AVG_PRICE} (price floor).`);
  console.log(`${belowLiquidity.length} kandidat dibuang karena avg nilai transaksi harian < Rp${MIN_AVG_DAILY_VALUE.toLocaleString('id-ID')} (liquidity floor).`);
  console.log(`${tooVolatile.length} kandidat dibuang karena volatilitas > ${MAX_ANNUAL_VOL_PCT}%/thn: ${tooVolatile.map((r) => `${r.ticker} (${Math.round(r.annualVolPct)}%)`).join(', ') || '-'}`);
  console.log(`${eligible.length} kandidat lolos KETIGA syarat, dari total ${results.length} valid.`);

  // Simpan seluruh hasil fetch (bukan cuma yang terpilih) supaya ambang bisa disetel
  // ulang lewat analisis file ini, tanpa menembak Yahoo ~900 kali lagi.
  fs.writeFileSync(
    'scripts/.backtest-universe-stats.json',
    JSON.stringify(results.sort((a, b) => b.avgDailyValue - a.avgDailyValue), null, 2)
  );

  eligible.sort((a, b) => b.avgDailyValue - a.avgDailyValue);
  const picked = eligible.slice(0, TARGET_TOTAL);

  if (picked.length < TARGET_TOTAL) {
    console.log(`\nCATATAN: cuma ${picked.length} emiten yang lolos ketiga syarat (cap ${TARGET_TOTAL}). Bursa memang tidak menyediakan lebih banyak yang memenuhi syarat - jangan diakali dengan melonggarkan floor.`);
  }

  const droppedSeeds = SEED_TICKERS.filter((t) => !picked.some((r) => r.ticker === t));
  console.log(`\n${droppedSeeds.length} dari ${SEED_TICKERS.length} seed lama TIDAK lolos floor: ${droppedSeeds.join(', ') || '-'}`);

  console.log(`\n=== ${picked.length} EMITEN TERPILIH (nilai transaksi harian tertinggi, 3 bulan terakhir) ===`);
  picked.forEach((r, i) => console.log(`${i + 1}. ${r.ticker} - avg daily value: ${Math.round(r.avgDailyValue).toLocaleString('id-ID')} - avg close: ${Math.round(r.avgClose).toLocaleString('id-ID')} - vol: ${Math.round(r.annualVolPct)}%/thn`));

  fs.writeFileSync(
    'scripts/.backtest-universe-candidates.json',
    JSON.stringify(picked.map((r) => r.ticker), null, 2)
  );
  console.log(`\nDitulis ke scripts/.backtest-universe-candidates.json - ini daftar universe LENGKAP (${picked.length} ticker), salin ke modules/backtest/constants/backtest-universe.ts`);
}

main();
