// Beta historis (kepekaan return saham terhadap benchmark) - dipakai Risk Matrix &
// Stress Testing (/risk) untuk menghitung skenario shock PORTOFOLIO PENGGUNA sungguhan,
// bukan angka generik (audit integritas data 2026-08-03, temuan M-09).
//
// Definisi baku: beta = Cov(return_aset, return_benchmark) / Var(return_benchmark),
// dihitung dari daily return historis 1 tahun. Return dipasangkan berdasarkan TANGGAL
// yang sama di kedua seri (bukan indeks array) supaya hari libur/halt yang berbeda
// antara saham dan benchmark tidak menggeser pasangan data.
export interface OhlcPoint {
  Date: string;
  Close: number;
}

export interface BetaResult {
  beta: number;
  sampleSize: number;
}

function toDateCloseMap(history: OhlcPoint[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const h of history) {
    map.set(h.Date.split('T')[0], h.Close);
  }
  return map;
}

/** Return harian berpasangan (tanggal yang SAMA ada di kedua seri) - array hasilnya
 * berurutan menurut tanggal, cocok untuk regresi beta. */
function pairedDailyReturns(assetHistory: OhlcPoint[], benchmarkHistory: OhlcPoint[]): { asset: number[]; benchmark: number[] } {
  const benchmarkMap = toDateCloseMap(benchmarkHistory);
  const dates = assetHistory.map((h) => h.Date.split('T')[0]).filter((d) => benchmarkMap.has(d));
  const dateSet = new Set(dates);

  const assetCloses: { date: string; close: number }[] = assetHistory
    .filter((h) => dateSet.has(h.Date.split('T')[0]))
    .map((h) => ({ date: h.Date.split('T')[0], close: h.Close }));

  const assetReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  for (let i = 1; i < assetCloses.length; i++) {
    const prevDate = assetCloses[i - 1].date;
    const currDate = assetCloses[i].date;
    const prevBenchmark = benchmarkMap.get(prevDate);
    const currBenchmark = benchmarkMap.get(currDate);
    const prevAsset = assetCloses[i - 1].close;
    const currAsset = assetCloses[i].close;
    if (prevBenchmark == null || currBenchmark == null || !prevBenchmark || !prevAsset) continue;
    assetReturns.push((currAsset - prevAsset) / prevAsset);
    benchmarkReturns.push((currBenchmark - prevBenchmark) / prevBenchmark);
  }
  return { asset: assetReturns, benchmark: benchmarkReturns };
}

/** null kalau data historis yang bertepatan tanggal kurang dari 30 pasang - beta dari
 * sampel terlalu kecil tidak stabil secara statistik, lebih baik dilaporkan tidak
 * tersedia daripada angka yang menyesatkan. */
export function calculateBeta(assetHistory: OhlcPoint[], benchmarkHistory: OhlcPoint[]): BetaResult | null {
  const { asset, benchmark } = pairedDailyReturns(assetHistory, benchmarkHistory);
  if (asset.length < 30) return null;

  const n = asset.length;
  const meanAsset = asset.reduce((a, b) => a + b, 0) / n;
  const meanBenchmark = benchmark.reduce((a, b) => a + b, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const da = asset[i] - meanAsset;
    const db = benchmark[i] - meanBenchmark;
    covariance += da * db;
    variance += db * db;
  }
  covariance /= n;
  variance /= n;

  if (variance === 0) return null;
  return { beta: covariance / variance, sampleSize: n };
}
