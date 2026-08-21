import { resolvePreviousClose } from '@/shared/market/previous-close';
import { getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';
import {
  computeQuantitativeMarketRegime,
  type RegimeDailyBar,
} from './market-regime.service';
import { AI_PICK_UNIVERSE } from '../constants/ai-pick-universe';
import { readIdxIhsgEod } from './idx-ihsg-eod.service';
// BUILD 002 (Refactor Domain) - dipindah dari app/api/market-pulse/route.ts, verbatim.
// IDX Indices
//
// BUG FIX (audit integritas data 2026-08-03, temuan L-03): field `symbol` untuk LQ45/
// IDX30/Kompas100 di sini TIDAK dipakai untuk fetch sungguhan (getMarketPulse() di bawah
// meng-override lewat tryFetchQuote() dengan daftar simbol sendiri per nama) - tapi
// sebelumnya field ini salah/menyesatkan: Kompas100 dideklarasikan dengan simbol '^JKSE'
// (simbol IHSG) dan fullName "(proxy IHSG)", padahal sejak C-01 tidak ada lagi proxy
// dari IHSG (lihat komentar tryFetchQuote di bawah - kalau Kompas100.JK gagal, quote
// tetap null, TIDAK di-derive dari IHSG). Disamakan dengan simbol yang benar-benar
// dipakai supaya field ini tidak menyesatkan pembaca kode.
const IDX_INDICES = [
  { symbol: '^JKSE', name: 'IHSG', fullName: 'Jakarta Composite Index' },
  { symbol: '^JKLQ45', name: 'LQ45', fullName: 'LQ45 Index' },
  { symbol: 'IDX30.JK', name: 'IDX30', fullName: 'IDX30 Index' },
  { symbol: 'Kompas100.JK', name: 'Kompas100', fullName: 'Kompas 100 Index' },
];

// IDX Sector representatives (top stocks per sector for heatmap)
// BUG FIX (2026-08-05, permintaan user): daftar per sektor diperluas dari 3-4 jadi
// 5-8 saham wakil (masih hardcoded/kurasi manual, BUKAN universe lengkap - lihat
// komentar HeatmapTile di app/market-pulse/page.tsx soal kenapa universe penuh per
// sektor tidak tersedia di aplikasi ini). Dijaga TIDAK saling tumpang tindih dengan
// PGAS/TBIG/MTEL (Infra & Transport) supaya 1 saham tidak dobel hitung di 2 sektor.
const IDX_SECTORS = [
  { sector: 'Financial', color: '#3b82f6', stocks: ['BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'BRIS.JK', 'BBTN.JK', 'ARTO.JK'] },
  { sector: 'Energy', color: '#f97316', stocks: ['ADRO.JK', 'PTBA.JK', 'MEDC.JK', 'ITMG.JK', 'HRUM.JK', 'INDY.JK', 'ELSA.JK'] },
  { sector: 'Consumer Defensive', color: '#22c55e', stocks: ['ICBP.JK', 'INDF.JK', 'UNVR.JK', 'MYOR.JK', 'CPIN.JK', 'JPFA.JK', 'GGRM.JK', 'HMSP.JK'] },
  // BUG FIX (2026-08-05): DCII.JK DIHAPUS dari sini - dikonfirmasi live ke Yahoo Finance
  // sektor asli DCII adalah "Real Estate / Real Estate Services", BUKAN Technology
  // (walau bisnisnya data center, Yahoo mengklasifikasikannya sebagai real estate).
  // Ditemukan saat menambahkan DCII.JK ke lib/tickers.ts (laporan user "saham DCII kok
  // gak ada"), bukan diganti dengan saham lain di sini - tidak ditebak penggantinya.
  { sector: 'Technology', color: '#8b5cf6', stocks: ['GOTO.JK', 'BUKA.JK', 'EMTK.JK', 'MTDL.JK'] },
  { sector: 'Telecom', color: '#06b6d4', stocks: ['TLKM.JK', 'ISAT.JK', 'EXCL.JK', 'TOWR.JK', 'FREN.JK'] },
  { sector: 'Basic Materials', color: '#eab308', stocks: ['ANTM.JK', 'INCO.JK', 'TINS.JK', 'INKP.JK', 'SMGR.JK', 'INTP.JK', 'TPIA.JK'] },
  { sector: 'Industrials', color: '#64748b', stocks: ['ASII.JK', 'UNTR.JK', 'AUTO.JK', 'SMSM.JK', 'GJTL.JK'] },
  { sector: 'Healthcare', color: '#ec4899', stocks: ['KLBF.JK', 'SIDO.JK', 'SILO.JK', 'MIKA.JK', 'HEAL.JK', 'PRDA.JK', 'TSPC.JK'] },
  { sector: 'Property', color: '#14b8a6', stocks: ['BSDE.JK', 'CTRA.JK', 'SMRA.JK', 'PWON.JK', 'ASRI.JK', 'APLN.JK'] },
  { sector: 'Infra & Transport', color: '#f43f5e', stocks: ['TBIG.JK', 'MTEL.JK', 'PGAS.JK', 'AKRA.JK', 'JSMR.JK', 'ASSA.JK'] },
  { sector: 'Consumer Cyclical', color: '#a855f7', stocks: ['MAPI.JK', 'ACES.JK', 'AMRT.JK', 'LPPF.JK', 'ERAA.JK', 'RALS.JK'] },
];

// Breadth memakai 100 emiten pertama dari universe likuid aktif SahamLens, bukan daftar
// manual 54 saham. Daftar sumbernya sudah dikurasi proyek dari listing/data riil dan
// diverifikasi tanpa duplikat; 100 adalah cakupan yang lebih representatif tetapi tetap
// bounded agar cron 5-menit tidak membebani provider.
export const MARKET_BREADTH_UNIVERSE_TARGET_SIZE = 100;
export const MARKET_BREADTH_STOCKS = AI_PICK_UNIVERSE.slice(0, MARKET_BREADTH_UNIVERSE_TARGET_SIZE);

// Pergerakan kecil di dalam pita ini diperlakukan sebagai stagnan. Konstanta ini
// dibagi antara perhitungan angka headline dan daftar emiten agar satu emiten tidak
// mungkin tampil sebagai "naik" pada kartu tetapi "stagnan" di modal detail.
export const BREADTH_STAGNANT_BAND_PCT = 0.1;
export type BreadthDirection = 'ADVANCING' | 'UNCHANGED' | 'DECLINING';

export function classifyBreadthDirection(changePct: number): BreadthDirection {
  if (changePct > BREADTH_STAGNANT_BAND_PCT) return 'ADVANCING';
  if (changePct < -BREADTH_STAGNANT_BAND_PCT) return 'DECLINING';
  return 'UNCHANGED';
}

function sourceTimestamp(result: any): string | null {
  const timestamps: unknown[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
  const latestBar = timestamps.reduce<number | null>((latest, value) => (
    typeof value === 'number' && Number.isFinite(value) && (latest == null || value > latest)
      ? value
      : latest
  ), null);
  const marketTime = result?.meta?.regularMarketTime;
  const unixTime = typeof marketTime === 'number' && Number.isFinite(marketTime)
    ? marketTime
    : latestBar;
  return unixTime == null ? null : new Date(unixTime * 1000).toISOString();
}

async function fetchYahooQuote(symbol: string) {
  try {
    // range=5d, dulu 1d. Bar 5 menit tetap dibutuhkan untuk sparkline, tapi dengan
    // rentang satu hari tidak ada satu pun sesi sebelumnya di respons - penutupan acuan
    // terpaksa diambil dari `meta`, yang terbukti bisa basi berhari-hari.
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=5m`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: getMarketAwareTtlSec() },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const validCloses = closes.filter((c: unknown): c is number =>
      typeof c === 'number' && Number.isFinite(c) && c > 0
    );
    // Bar di sini 5 menit, bukan harian - jadi penutupan harian diturunkan dulu dengan
    // mengelompokkan per TANGGAL BURSA Jakarta dan mengambil bar terakhir tiap tanggal.
    // Barulah hasilnya bisa diadu memakai aturan yang sama dengan jalur lain.
    const dailyByDate = new Map<string, { ts: number; close: number }>();
    const jakartaFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const rawTimestamps: unknown[] = Array.isArray(result.timestamp) ? result.timestamp : [];
    for (let i = 0; i < rawTimestamps.length; i++) {
      const ts = rawTimestamps[i];
      const c = closes[i];
      if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
      if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue;
      // Ditimpa terus, jadi yang tersisa adalah bar TERAKHIR pada tanggal itu.
      dailyByDate.set(jakartaFmt.format(new Date(ts * 1000)), { ts, close: c });
    }
    const dailyBars = Array.from(dailyByDate.values());
    const resolved = resolvePreviousClose({
      timestamps: dailyBars.map((b) => b.ts),
      closes: dailyBars.map((b) => b.close),
      metaPreviousClose: meta.previousClose,
      metaChartPreviousClose: meta.chartPreviousClose,
    });
    const prevCandidate = resolved.previousClose ?? validCloses[0];
    const priceCandidate = meta.regularMarketPrice ?? validCloses[validCloses.length - 1];
    if (
      typeof prevCandidate !== 'number' || !Number.isFinite(prevCandidate) || prevCandidate <= 0 ||
      typeof priceCandidate !== 'number' || !Number.isFinite(priceCandidate) || priceCandidate <= 0
    ) return null;
    const prevClose = prevCandidate;
    const currentPrice = priceCandidate;
    const changePct = ((currentPrice - prevClose) / prevClose) * 100;
    const rawVolume = meta.regularMarketVolume;
    const volume = typeof rawVolume === 'number' && Number.isFinite(rawVolume) && rawVolume >= 0
      ? rawVolume
      : null;

    return {
      symbol,
      price: currentPrice,
      prevClose,
      changePct: parseFloat(changePct.toFixed(2)),
      sparkline: validCloses.slice(-50).map((c: number) => parseFloat(c.toFixed(2))),
      volume,
      sourceTimestamp: sourceTimestamp(result),
    };
  } catch {
    return null;
  }
}

async function fetchQuoteSimple(symbol: string) {
  try {
    // range=5d, dulu 1d. Dengan 1d riwayatnya cuma SATU bar, jadi tidak ada sesi
    // sebelumnya untuk dibandingkan dan penutupan acuan terpaksa diambil dari `meta` -
    // nilai yang terbukti bisa basi berhari-hari (lihat catatan di bawah).
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: getMarketAwareTtlSec() },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    // Penutupan acuan dari riwayat harian, bukan `meta`. Terukur 2026-08-14: meta
    // melaporkan penutupan 7 Agustus untuk TLKM/ASII/BMRI - seminggu basi - sehingga
    // TLKM tampil -4,43% padahal 0,00%, BMRI -2,59% padahal 0,00%, BBCA 0,00% padahal
    // +0,39%. Tiga dari enam sampel berbalik ARAH. Daftar breadth inilah yang menyusun
    // "yang naik / yang turun", jadi acuan yang meleset membalik keanggotaan kolomnya.
    const resolved = resolvePreviousClose({
      timestamps: result.timestamp,
      closes: result.indicators?.quote?.[0]?.close,
      metaPreviousClose: meta.previousClose,
      metaChartPreviousClose: meta.chartPreviousClose,
    });
    const prevCandidate = resolved.previousClose;
    const priceCandidate = meta.regularMarketPrice;
    if (
      typeof prevCandidate !== 'number' || !Number.isFinite(prevCandidate) || prevCandidate <= 0 ||
      typeof priceCandidate !== 'number' || !Number.isFinite(priceCandidate) || priceCandidate <= 0
    ) return null;
    const changePct = ((priceCandidate - prevCandidate) / prevCandidate) * 100;
    const rawVolume = meta.regularMarketVolume;

    return {
      symbol,
      price: priceCandidate,
      changePct: parseFloat(changePct.toFixed(2)),
      volume: typeof rawVolume === 'number' && Number.isFinite(rawVolume) && rawVolume >= 0
        ? rawVolume
        : null,
      sourceTimestamp: sourceTimestamp(result),
    };
  } catch {
    return null;
  }
}

async function fetchDailyHistory(symbol: string): Promise<RegimeDailyBar[]> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?range=1y&interval=1d';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: getMarketAwareTtlSec() },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return [];
    const json = await res.json();
    const result = json.chart?.result?.[0];
    const timestamps: unknown[] = result?.timestamp ?? [];
    const closes: unknown[] = result?.indicators?.quote?.[0]?.close ?? [];
    return timestamps.flatMap((timestamp, index) => {
      const close = closes[index];
      if (
        typeof timestamp !== 'number' ||
        !Number.isFinite(timestamp) ||
        typeof close !== 'number' ||
        !Number.isFinite(close) ||
        close <= 0
      ) return [];
      return [{
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close,
      }];
    });
  } catch {
    return [];
  }
}

// Coba tiap simbol berurutan, pakai quote PERTAMA yang benar-benar punya harga (> 0).
// Sebelumnya ini ditulis sebagai `await fetchYahooQuote(a) || await fetchYahooQuote(b)` -
// operator || gagal karena Yahoo sering mengembalikan OBJEK truthy dengan price: 0 untuk
// simbol yang ada tapi tanpa data intraday (mis. 'LQ45.JK'), jadi fallback ke simbol yang
// benar-benar berfungsi ('^JKLQ45') tidak pernah tereksekusi - macet di angka dummy di
// bawah. Sekarang eksplisit cek price > 0 di tiap kandidat.
async function tryFetchQuote(...symbols: string[]) {
  for (const s of symbols) {
    const q = await fetchYahooQuote(s);
    if (q && q.price > 0) return q;
  }
  return null;
}

type PulseIndexRow = {
  name: string;
  price: number | null;
  changePct: number | null;
  sourceTimestamp: string | null;
  source: 'YAHOO_CHART' | 'IDX_OFFICIAL_INDEX_SUMMARY';
  [key: string]: unknown;
};

export function applyOfficialIhsgClose<T extends PulseIndexRow>(indices: T[], official: ReturnType<typeof readIdxIhsgEod>): T[] {
  if (!official) return indices;
  return indices.map((index) => {
    if (index.name !== 'IHSG') return index;
    const yahooDate = index.sourceTimestamp?.slice(0, 10) ?? null;
    if (yahooDate && official.tradeDate < yahooDate) return index;
    return {
      ...index,
      price: official.price,
      changePct: official.changePct,
      sourceTimestamp: official.sourceTimestamp,
      source: official.source,
    };
  });
}

export async function getMarketPulse() {
  // Histori dimulai bersama fetch indeks agar tidak menambah waterfall request.
  const ihsgHistoryPromise = fetchDailyHistory('^JKSE');

  // 1. Fetch indices with sparkline
  let indicesData = await Promise.all(
    IDX_INDICES.map(async (idx) => {
      let quote = null;

      if (idx.name === 'IDX30') {
        // Urutan simbol dicoba: keduanya valid di Yahoo, IDX30.JK didahulukan karena
        // biasanya lebih lengkap datanya (sparkline interval 5m).
        quote = await tryFetchQuote('IDX30.JK', '^IDX30.JK');
      } else if (idx.name === 'LQ45') {
        // '^JKLQ45' didahulukan - terverifikasi konsisten mengembalikan harga (LQ45.JK
        // sering price:0), lihat catatan tryFetchQuote di atas.
        quote = await tryFetchQuote('^JKLQ45', 'LQ45.JK');
      } else if (idx.name === 'Kompas100') {
        quote = await tryFetchQuote('Kompas100.JK');
        // TIDAK ADA proxy dari IHSG/konstanta - Kompas100 dan IHSG adalah indeks
        // berbeda (basis & anggota beda), membaginya dengan konstanta ajaib (dulu 5.42)
        // menghasilkan angka yang kelihatan masuk akal tapi bukan Kompas100 sungguhan.
        // Kalau Yahoo tidak punya datanya, quote tetap null -> UI tampilkan N/A.
      } else {
        quote = await fetchYahooQuote(idx.symbol);
      }

      // TIDAK ADA fallback angka dummy - kalau quote gagal/null, price/changePct/volume
      // dikembalikan null (bukan 0) supaya UI bisa membedakan "pasar flat" dari "data
      // tidak tersedia", dan tidak ada angka dummy yang bisa keliru dianggap data asli.
      return {
        ...idx,
        price: quote?.price ?? null,
        changePct: quote?.changePct ?? null,
        sparkline: quote?.sparkline || [],
        volume: quote?.volume ?? null,
        sourceTimestamp: quote?.sourceTimestamp ?? null,
        source: 'YAHOO_CHART' as 'YAHOO_CHART' | 'IDX_OFFICIAL_INDEX_SUMMARY',
      };
    })
  );

  // Yahoo menghentikan bar intraday IHSG sebelum lelang penutupan selesai (sering
  // sekitar 15:45 WIB). Sesudah artefak EOD resmi BEI tersedia, angka headline harus
  // memakai close BEI dan perubahan close-to-close resmi. Yahoo tetap dipakai selama
  // sesi berjalan dan untuk sparkline; artefak BEI yang tanggalnya lebih tua tidak
  // boleh menimpa sesi yang lebih baru.
  indicesData = applyOfficialIhsgClose(indicesData, readIdxIhsgEod());

  // 2. Fetch sector stocks in batches
  const allSectorStocks = IDX_SECTORS.flatMap(s => s.stocks);
  const uniqueStocks = Array.from(new Set(allSectorStocks));

  // Fetch in chunks of 8
  const stockQuotes: Record<string, any> = {};
  for (let i = 0; i < uniqueStocks.length; i += 8) {
    const chunk = uniqueStocks.slice(i, i + 8);
    const results = await Promise.all(chunk.map(s => fetchQuoteSimple(s)));
    results.forEach((r, idx) => {
      if (r) stockQuotes[chunk[idx]] = r;
    });
  }

  // Build sector heatmap
  const sectorHeatmap = IDX_SECTORS.map(sector => {
    const stocksData = sector.stocks
      .map(s => stockQuotes[s])
      .filter(Boolean);

    // BUG FIX (audit logika & algoritma 2026-08-05, temuan M-3): `meta.marketCap` TIDAK
    // ADA di Yahoo chart API (diverifikasi langsung ke endpoint-nya: field itu bukan
    // bagian dari `chart.result[].meta`). Jadi `marketCap` di sini SELALU 0, dan UI
    // memakainya untuk mengatur ukuran + urutan tile heatmap - artinya tata letak
    // "berdasarkan kapitalisasi pasar" tidak pernah benar-benar terjadi. Field dihapus
    // (bukan diisi angka lain): heatmap sekarang diurutkan berdasarkan besarnya pergerakan
    // sektor, sesuatu yang memang dihitung dari data nyata.
    //
    // `changePct` = rata-rata SEDERHANA dari 3-4 saham wakil sektor (bukan indeks sektor
    // resmi IDX, bukan pembobotan kapitalisasi) - `isProxy` + `sampleSize` dikirim supaya
    // UI bisa menyatakannya, alih-alih terbaca sebagai kinerja sektor sesungguhnya.
    const avgChange = stocksData.length > 0
      ? stocksData.reduce((sum, s) => sum + s.changePct, 0) / stocksData.length
      : null;

    return {
      sector: sector.sector,
      color: sector.color,
      changePct: avgChange != null ? parseFloat(avgChange.toFixed(2)) : null,
      isProxy: true,
      sampleSize: stocksData.length,
      stocks: stocksData.map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        changePct: s.changePct,
      }))
    };
  });

  // 3. Fetch breadth data in batches
  const breadthQuotes: any[] = [];
  for (let i = 0; i < MARKET_BREADTH_STOCKS.length; i += 10) {
    const chunk = MARKET_BREADTH_STOCKS.slice(i, i + 10);
    const results = await Promise.all(chunk.map(s => fetchQuoteSimple(s)));
    results.forEach(r => { if (r) breadthQuotes.push(r); });
  }

  const breadthStocks = breadthQuotes.map((stock) => ({
    symbol: stock.symbol.replace('.JK', ''),
    price: stock.price,
    changePct: stock.changePct,
    direction: classifyBreadthDirection(stock.changePct),
  }));
  const advancing = breadthStocks.filter((stock) => stock.direction === 'ADVANCING').length;
  const declining = breadthStocks.filter((stock) => stock.direction === 'DECLINING').length;
  const unchanged = breadthStocks.length - advancing - declining;
  // Jangan memakai waktu server sebagai "as of". Pada akhir pekan, server tetap
  // berjalan tetapi harga Yahoo masih harga sesi terakhir; timestamp quote ini yang
  // harus ditampilkan agar pengguna tidak mengira angka tersebut live hari libur.
  const sourceTimes = [
    ...indicesData.map((index) => index.sourceTimestamp),
    ...breadthQuotes.map((stock) => stock.sourceTimestamp),
  ].filter((value): value is string => typeof value === 'string')
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);
  const snapshotAsOf = sourceTimes.length > 0
    ? new Date(Math.max(...sourceTimes)).toISOString()
    : new Date().toISOString();
  const ihsgHistory = await ihsgHistoryPromise;
  const marketRegime = computeQuantitativeMarketRegime({
    asOf: snapshotAsOf,
    ihsgHistory,
    breadth: {
      total: breadthQuotes.length,
      expectedTotal: MARKET_BREADTH_STOCKS.length,
      advancing,
      declining,
      unchanged,
    },
    indices: indicesData.map((index) => ({
      name: index.name,
      changePct: index.changePct,
    })),
    sectors: sectorHeatmap.map((sector) => ({
      sector: sector.sector,
      changePct: sector.changePct,
    })),
  });

  return {
    timestamp: snapshotAsOf,
    marketRegime,
    indices: indicesData,
    sectorHeatmap: sectorHeatmap.sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0)),
    breadth: {
      total: breadthQuotes.length,
      expectedTotal: MARKET_BREADTH_STOCKS.length,
      advancing,
      declining,
      unchanged,
      advanceDeclineRatio: declining > 0 ? parseFloat((advancing / declining).toFixed(2)) : advancing,
      // Daftar ini adalah 100 quote nyata yang sama dengan pembilang Breadth di atas,
      // bukan hasil screening tambahan ataupun data contoh. UI cukup memfilter menurut
      // direction sehingga total ketiga modal selalu tie-out ke angka headline.
      stocks: breadthStocks,
      topGainers: [...breadthQuotes].sort((a, b) => b.changePct - a.changePct).slice(0, 5).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        changePct: s.changePct,
        price: s.price
      })),
      topLosers: [...breadthQuotes].sort((a, b) => a.changePct - b.changePct).slice(0, 5).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        changePct: s.changePct,
        price: s.price
      })),
      topVolume: breadthQuotes.filter((s) => s.volume != null).sort((a, b) => b.volume - a.volume).slice(0, 5).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        volume: s.volume
      })),
      topValue: breadthQuotes.filter((s) => s.volume != null).sort((a, b) => (b.volume * b.price) - (a.volume * a.price)).slice(0, 5).map(s => ({
        symbol: s.symbol.replace('.JK', ''),
        value: s.volume * s.price
      })),
      // topFreq & netForeign SEBELUMNYA ada di sini berisi Math.random() murni (komentar
      // asli "Mock frequency") dan tidak pernah ditampilkan di UI manapun - dihapus,
      // bukan disimpan sebagai data palsu yang berisiko suatu saat dipakai tanpa sadar.
      // Data frekuensi transaksi & net foreign flow riil butuh feed data broker IDX
      // yang tidak tersedia gratis lewat Yahoo Finance.
    }
  };
}
