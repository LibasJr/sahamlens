import { fetchYahooHistory, analyzeRsi } from '@/modules/technical';
import { calculateIntrinsicValue } from '@/modules/fundamental';
import { fetchScreenerUniverse } from '@/modules/market/service/screener.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { classifyFreshness } from '@/shared/http/freshness';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';

const COMPARE_STOCK_CACHE_VERSION = 'v1';
const COMPARE_PEER_CACHE_VERSION = 'v1';

function normalizeYahooSymbol(rawSymbol: string): string {
  return rawSymbol.endsWith('.JK') ? rawSymbol : `${rawSymbol}.JK`;
}

/**
 * Lawan banding sesektor untuk symbol1, DI-CACHE tersendiri.
 *
 * Yang di-cache adalah keputusannya ("peer BBCA adalah BBRI"), bukan bahan bakunya.
 * Bedanya bukan kosmetik: bahan bakunya adalah universe screener, sebuah entri
 * bersama ber-TTL 30 menit yang juga melayani screener, dividend, dan calendar.
 * Selama /compare menumpang entri itu, setiap kali ia kedaluwarsa pengunjung
 * /compare berikutnya membayar quoteSummary untuk 200 ticker - 17 detik terukur -
 * hanya untuk menyimpulkan satu kode saham yang jawabannya tidak berubah.
 */
async function resolveSameSectorPeer(symbol1: string): Promise<string | null> {
  const code1 = symbol1.replace('.JK', '').toUpperCase();
  // Nilai null ikut disimpan lewat pembungkus objek. Tanpa itu "tidak ada peer" selalu
  // terbaca sebagai cache miss oleh getOrCompute, sehingga justru emiten di luar universe
  // - yang penelusurannya paling mahal - yang tidak pernah mendapat cache. Bentuknya
  // sengaja sama dengan sentinel { notFound: true } di readCachedStockData di bawah.
  const cached = await getOrCompute(
    `sahamlens:cache:computed:compare-peer:${COMPARE_PEER_CACHE_VERSION}:${code1}`,
    CACHE_TTL_SEC.COMPARE_PEER,
    async () => ({ peer: await pickSameSectorPeer(symbol1) }),
  );
  return cached.peer;
}

async function pickSameSectorPeer(symbol1: string): Promise<string | null> {
  const code1 = symbol1.replace('.JK', '').toUpperCase();
  try {
    const universe = await getOrCompute(
      COMPUTED_CACHE_KEY.SCREENER_UNIVERSE,
      CACHE_TTL_SEC.SCREENER_UNIVERSE,
      fetchScreenerUniverse,
    );
    let entry1 = universe.find((s) => s.ticker.toUpperCase() === code1);

    if (!entry1) {
      const YahooFinanceClass = (await import('yahoo-finance2')).default;
      const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });
      const q = await yahooFinance.quoteSummary(symbol1, { modules: ['assetProfile'] }).catch(() => null);
      const sector = q?.assetProfile?.sector;
      if (!sector) return null;
      entry1 = { ticker: code1, sector } as any;
      const peer = universe.find((s) => s.sector === sector && s.ticker.toUpperCase() !== code1);
      return peer ? `${peer.ticker}.JK` : null;
    }

    const peer = universe.find((s) => s.sector === entry1.sector && s.ticker.toUpperCase() !== code1);
    return peer ? `${peer.ticker}.JK` : null;
  } catch {
    return null;
  }
}

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function maStatusOf(price: number, ma50: number | null, ma200: number | null): string {
  if (ma50 == null || ma200 == null) return 'DATA BELUM CUKUP';
  if (price > ma50 && ma50 > ma200) return 'UPTREND KUAT';
  if (price > ma50 && price < ma200) return 'REBOUND LEMAH';
  if (price > ma200 && price < ma50) return 'KOREKSI';
  if (price < ma50 && price < ma200) return 'DOWNTREND';
  return 'SIDEWAYS';
}

async function buildStockData(rawSymbol: string) {
  const symbol = normalizeYahooSymbol(rawSymbol);
  const [hist, intrinsic] = await Promise.all([
    fetchYahooHistory(symbol, '1y'),
    calculateIntrinsicValue(symbol).catch(() => null),
  ]);
  if (!hist) return null;

  const closes = hist.history.map((h) => h.AdjClose ?? h.Close);
  const highs = hist.history.map((h) => h.High);
  const lows = hist.history.map((h) => h.Low);
  const lastClose = hist.history[hist.history.length - 1]?.Close;
  const price = isFinitePositive(hist.currentPrice)
    ? hist.currentPrice
    : isFinitePositive(lastClose)
      ? lastClose
      : null;
  if (price == null) return null;

  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const rsiResult = analyzeRsi(hist.history, price);
  const rsi = typeof rsiResult?.raw?.rsi === 'number' ? rsiResult.raw.rsi : null;

  const lookback = Math.min(20, hist.history.length);
  const support = Math.min(...lows.slice(-lookback));
  const resistance = Math.max(...highs.slice(-lookback));
  const risk = price - support;
  const reward = resistance - price;
  const rrRatio = risk > 0 ? reward / risk : null;

  let scoreConditions = 0;
  const totalConditions = 4;
  if (ma20 != null && price > ma20) scoreConditions++;
  if (ma20 != null && ma50 != null && ma20 > ma50) scoreConditions++;
  if (ma50 != null && ma200 != null && ma50 > ma200) scoreConditions++;
  if (rsi != null && rsi >= 45 && rsi <= 70) scoreConditions++;
  const score = Math.round((scoreConditions / totalConditions) * 100);

  const eps = isFinitePositive(intrinsic?.eps) ? intrinsic.eps : null;
  const bvps = isFinitePositive(intrinsic?.bvps) ? intrinsic.bvps : null;
  const per = eps != null ? price / eps : null;
  const pbv = bvps != null ? price / bvps : null;
  const fresh = classifyFreshness(hist.regularMarketTime);

  return {
    symbol,
    price,
    score,
    maStatus: maStatusOf(price, ma50, ma200),
    per,
    pbv,
    rsi,
    rr: rrRatio,
    support,
    resistance,
    fairValue: isFinitePositive(intrinsic?.fair_value) ? intrinsic.fair_value : null,
    mos: intrinsic?.mos ?? null,
    _meta: {
      freshness: fresh.freshness,
      dataTimestamp: fresh.dataTimestamp,
      ageSeconds: fresh.ageSeconds,
    },
  };
}

export type ComparisonStockData = NonNullable<Awaited<ReturnType<typeof buildStockData>>>;

async function readCachedStockData(rawSymbol: string): Promise<ComparisonStockData | null> {
  const symbol = normalizeYahooSymbol(rawSymbol);
  const value = await getOrCompute(
    `sahamlens:cache:computed:compare-stock:${COMPARE_STOCK_CACHE_VERSION}:${symbol}`,
    CACHE_TTL_SEC.COMPARE_STOCK,
    async () => (await buildStockData(symbol)) ?? { notFound: true as const },
  );
  return 'notFound' in value ? null : value;
}

function explainRow(label: string, a: ComparisonStockData, b: ComparisonStockData, winner: string): string {
  const loser = winner === a.symbol ? b.symbol : a.symbol;
  switch (label) {
    case 'score':
      return `${winner} punya skor teknikal ${winner === a.symbol ? a.score : b.score} vs ${loser} ${winner === a.symbol ? b.score : a.score} - indikator gabungan (tren MA + RSI) lebih solid di ${winner}.`;
    case 'ma':
      return `${a.symbol} ${a.maStatus.toLowerCase()}, ${b.symbol} ${b.maStatus.toLowerCase()} - ${winner} punya struktur tren jangka menengah yang lebih kuat saat ini.`;
    case 'per':
      if (a.per == null || b.per == null) return 'Data PER tidak lengkap untuk salah satu saham (kemungkinan laba negatif).';
      return `${winner} diperdagangkan di PER ${(winner === a.symbol ? a.per : b.per).toFixed(1)}x, lebih murah dibanding ${loser} ${(winner === a.symbol ? b.per : a.per).toFixed(1)}x - secara valuasi earning ${winner} lebih menarik.`;
    case 'pbv':
      if (a.pbv == null || b.pbv == null) return 'Data PBV tidak lengkap untuk salah satu saham.';
      return `${winner} punya PBV ${(winner === a.symbol ? a.pbv : b.pbv).toFixed(2)}x vs ${loser} ${(winner === a.symbol ? b.pbv : a.pbv).toFixed(2)}x - ${winner} lebih murah relatif terhadap nilai buku.`;
    case 'rsi':
      return `RSI ${a.symbol} ${a.rsi?.toFixed(1) ?? '-'} vs ${b.symbol} ${b.rsi?.toFixed(1) ?? '-'} - ${winner} berada di zona yang lebih sehat (tidak overbought/oversold ekstrem).`;
    case 'rr':
      return `Ruang naik/turun 20D ${winner} ${(winner === a.symbol ? a.rr : b.rr)?.toFixed(1)}x lebih besar dibanding ${loser} ${(winner === a.symbol ? b.rr : a.rr)?.toFixed(1)}x. Ini posisi di range 20 hari, bukan setup risk/reward trading.`;
    default:
      return '';
  }
}

export interface StockComparisonResult {
  data1: Pick<ComparisonStockData, 'symbol' | 'price' | '_meta'>;
  data2: Pick<ComparisonStockData, 'symbol' | 'price' | '_meta'>;
  rows: Array<{ key: string; label: string; a: string; b: string; winner: string; reason: string }>;
  conclusion: string;
}

export async function buildStockComparison(symbol1: string, requestedSymbol2?: string | null): Promise<StockComparisonResult | null> {
  const symbol2 = requestedSymbol2 || (await resolveSameSectorPeer(symbol1)) || 'BBRI.JK';
  const [data1, data2] = await Promise.all([readCachedStockData(symbol1), readCachedStockData(symbol2)]);
  if (!data1 || !data2) return null;

  const scoreWinner = data1.score >= data2.score ? data1.symbol : data2.symbol;
  const rank: Record<string, number> = {
    'UPTREND KUAT': 4,
    'REBOUND LEMAH': 3,
    SIDEWAYS: 2,
    KOREKSI: 2,
    DOWNTREND: 1,
    'DATA BELUM CUKUP': 0,
  };
  const maWinner = (rank[data1.maStatus] ?? 0) >= (rank[data2.maStatus] ?? 0) ? data1.symbol : data2.symbol;
  const perWinner = data1.per != null && data2.per != null ? (data1.per < data2.per ? data1.symbol : data2.symbol) : '-';
  const pbvWinner = data1.pbv != null && data2.pbv != null ? (data1.pbv < data2.pbv ? data1.symbol : data2.symbol) : '-';
  const rsiWinner = (() => {
    if (data1.rsi == null || data2.rsi == null) return '-';
    const dist = (r: number) => Math.abs(r - 55);
    return dist(data1.rsi) <= dist(data2.rsi) ? data1.symbol : data2.symbol;
  })();
  const rrWinner = data1.rr != null && data2.rr != null ? (data1.rr > data2.rr ? data1.symbol : data2.symbol) : '-';

  const winners = { score: scoreWinner, ma: maWinner, per: perWinner, pbv: pbvWinner, rsi: rsiWinner, rr: rrWinner };
  const rows = [
    { key: 'score', label: 'Skor Teknikal', a: `${data1.score}`, b: `${data2.score}`, winner: winners.score, reason: explainRow('score', data1, data2, winners.score) },
    { key: 'ma', label: 'MA Status', a: data1.maStatus, b: data2.maStatus, winner: winners.ma, reason: explainRow('ma', data1, data2, winners.ma) },
    { key: 'per', label: 'PER (Valuasi)', a: data1.per != null ? `${data1.per.toFixed(1)}x` : 'N/A', b: data2.per != null ? `${data2.per.toFixed(1)}x` : 'N/A', winner: winners.per, reason: winners.per !== '-' ? explainRow('per', data1, data2, winners.per) : 'Data PER tidak lengkap (laba negatif atau data tidak tersedia).' },
    { key: 'pbv', label: 'PBV', a: data1.pbv != null ? `${data1.pbv.toFixed(2)}x` : 'N/A', b: data2.pbv != null ? `${data2.pbv.toFixed(2)}x` : 'N/A', winner: winners.pbv, reason: winners.pbv !== '-' ? explainRow('pbv', data1, data2, winners.pbv) : 'Data PBV tidak lengkap.' },
    { key: 'rsi', label: 'RSI (14)', a: data1.rsi != null ? data1.rsi.toFixed(1) : 'N/A', b: data2.rsi != null ? data2.rsi.toFixed(1) : 'N/A', winner: winners.rsi, reason: winners.rsi !== '-' ? explainRow('rsi', data1, data2, winners.rsi) : 'Data historis belum cukup untuk RSI.' },
    { key: 'rr', label: 'Ruang Naik/Turun 20D', a: data1.rr != null ? `${data1.rr.toFixed(1)}x` : 'N/A', b: data2.rr != null ? `${data2.rr.toFixed(1)}x` : 'N/A', winner: winners.rr, reason: winners.rr !== '-' ? explainRow('rr', data1, data2, winners.rr) : 'Harga terlalu dekat/di bawah support 20 hari untuk dihitung.' },
  ];

  const winCount1 = Object.values(winners).filter((winner) => winner === data1.symbol).length;
  const winCount2 = Object.values(winners).filter((winner) => winner === data2.symbol).length;
  const overallWinner = winCount1 > winCount2 ? data1.symbol : winCount2 > winCount1 ? data2.symbol : null;
  const conclusion = overallWinner
    ? `Dari ${rows.length} metrik yang dibandingkan, ${overallWinner} unggul di ${Math.max(winCount1, winCount2)} metrik yang tersedia. Gunakan baris metrik di atas sebagai konteks, bukan rekomendasi beli/jual otomatis.`
    : `${data1.symbol} dan ${data2.symbol} sama-sama unggul di ${winCount1} dari ${rows.length} metrik yang tersedia. Gunakan konteks sektor, valuasi, dan risiko sebelum mengambil keputusan.`;

  return {
    data1: { symbol: data1.symbol, price: data1.price, _meta: data1._meta },
    data2: { symbol: data2.symbol, price: data2.price, _meta: data2._meta },
    rows,
    conclusion,
  };
}
