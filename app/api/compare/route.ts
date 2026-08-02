import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccessLive } from '@/modules/user';
import { fetchYahooHistory } from '@/modules/technical';
import { calculateIntrinsicValue } from '@/modules/fundamental';
import { fetchScreenerUniverse } from '@/modules/market/service/screener.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

const SCREENER_CACHE_KEY = 'sahamlens:cache:computed:screener-universe';

// Sebelumnya symbol2 default hardcode 'BBRI.JK' apa pun symbol1-nya - kalau user
// baru saja lihat TLKM (telekomunikasi) lalu buka /compare tanpa pilih simbol
// kedua, yang muncul malah BBRI (perbankan), tidak nyambung sama sekali. Sekarang
// cari peer 1 sektor dari universe screener yang sama (cached 30 menit, lihat
// app/api/screener/route.ts) - kalau symbol1 tidak ada di universe 49 saham itu,
// fallback fetch sector live sekali saja untuk simbol itu.
async function pickSameSectorPeer(symbol1: string): Promise<string | null> {
  const code1 = symbol1.replace('.JK', '').toUpperCase();
  try {
    const universe = await getOrCompute(SCREENER_CACHE_KEY, CACHE_TTL_SEC.SCREENER_UNIVERSE, fetchScreenerUniverse);
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

    const peer = universe.find((s) => s.sector === entry1!.sector && s.ticker.toUpperCase() !== code1);
    return peer ? `${peer.ticker}.JK` : null;
  } catch {
    return null;
  }
}

// REWRITE TOTAL - versi sebelumnya (generateData()) menghasilkan SEMUA angka
// (Score, MA Status, PER, PBV, Foreign Flow, Risk/Reward) dari seeded pseudo-random
// hash nama simbol, cuma harga yang asli dari Yahoo. "KESIMPULAN AI" pun cuma
// interpolasi string, bukan analisis apapun. Sekarang semua dihitung dari data
// OHLCV & fundamental Yahoo Finance yang sama seperti fitur lain di app ini -
// "Foreign 20D" dihapus karena data flow broker asing tidak tersedia gratis (sama
// alasan dengan Bandarmology di screener), diganti RSI(14) yang bisa dihitung riil.

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  const rs = (gains / 14) / avgLoss;
  return 100 - 100 / (1 + rs);
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
  const symbol = rawSymbol.endsWith('.JK') ? rawSymbol : `${rawSymbol}.JK`;
  const [hist, intrinsic] = await Promise.all([
    fetchYahooHistory(symbol, '1y'),
    calculateIntrinsicValue(symbol).catch(() => null),
  ]);
  if (!hist) return null;

  const closes = hist.history.map((h) => h.Close);
  const highs = hist.history.map((h) => h.High);
  const lows = hist.history.map((h) => h.Low);
  const price = hist.currentPrice || closes[closes.length - 1];

  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const rsi = rsi14(closes);

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

  const eps = intrinsic?.eps || 0;
  const bvps = intrinsic?.bvps || 0;
  const per = eps > 0 ? price / eps : null;
  const pbv = bvps > 0 ? price / bvps : null;

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
    fairValue: intrinsic?.fair_value || null,
    mos: intrinsic?.mos ?? null,
  };
}

type StockData = NonNullable<Awaited<ReturnType<typeof buildStockData>>>;

// Council AI menjelaskan setiap baris perbandingan secara deterministik dari angka
// riil di atas - bukan panggilan model bahasa (supaya selalu tersedia, gratis, dan
// tidak bergantung kuota Gemini yang gampang habis).
function explainRow(
  label: string,
  a: StockData,
  b: StockData,
  winner: string,
  formatA: string,
  formatB: string
): string {
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
      return `Risk/Reward ${winner} 1:${(winner === a.symbol ? a.rr : b.rr)?.toFixed(1)} lebih baik dibanding ${loser} 1:${(winner === a.symbol ? b.rr : a.rr)?.toFixed(1)}, dihitung dari jarak ke support/resistance 20 hari terakhir.`;
    default:
      return '';
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }
  const hasPro = await checkProAccessLive(session);
  if (!hasPro) {
    return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
  }

  const { searchParams } = new URL(request.url);
  const symbol1 = searchParams.get('symbol1') || 'BBCA.JK';
  const rawSymbol2 = searchParams.get('symbol2');
  const symbol2 = rawSymbol2 || (await pickSameSectorPeer(symbol1)) || 'BBRI.JK';

  const [data1, data2] = await Promise.all([buildStockData(symbol1), buildStockData(symbol2)]);
  if (!data1 || !data2) {
    return NextResponse.json({ error: 'Data tidak tersedia untuk salah satu simbol' }, { status: 404 });
  }

  const scoreWinner = data1.score >= data2.score ? data1.symbol : data2.symbol;
  const maWinner = (() => {
    const rank: Record<string, number> = { 'UPTREND KUAT': 4, 'REBOUND LEMAH': 3, 'SIDEWAYS': 2, 'KOREKSI': 2, 'DOWNTREND': 1, 'DATA BELUM CUKUP': 0 };
    return (rank[data1.maStatus] ?? 0) >= (rank[data2.maStatus] ?? 0) ? data1.symbol : data2.symbol;
  })();
  const perWinner = data1.per != null && data2.per != null ? (data1.per < data2.per ? data1.symbol : data2.symbol) : '-';
  const pbvWinner = data1.pbv != null && data2.pbv != null ? (data1.pbv < data2.pbv ? data1.symbol : data2.symbol) : '-';
  const rsiWinner = (() => {
    if (data1.rsi == null || data2.rsi == null) return '-';
    const dist = (r: number) => Math.abs(r - 55); // 55 dianggap titik tengah paling sehat
    return dist(data1.rsi) <= dist(data2.rsi) ? data1.symbol : data2.symbol;
  })();
  const rrWinner = data1.rr != null && data2.rr != null ? (data1.rr > data2.rr ? data1.symbol : data2.symbol) : '-';

  const winners = { score: scoreWinner, ma: maWinner, per: perWinner, pbv: pbvWinner, rsi: rsiWinner, rr: rrWinner };
  const rows = [
    { key: 'score', label: 'Skor Teknikal', a: `${data1.score}`, b: `${data2.score}`, winner: winners.score, reason: winners.score !== '-' ? explainRow('score', data1, data2, winners.score, '', '') : '' },
    { key: 'ma', label: 'MA Status', a: data1.maStatus, b: data2.maStatus, winner: winners.ma, reason: explainRow('ma', data1, data2, winners.ma, '', '') },
    { key: 'per', label: 'PER (Valuasi)', a: data1.per != null ? `${data1.per.toFixed(1)}x` : 'N/A', b: data2.per != null ? `${data2.per.toFixed(1)}x` : 'N/A', winner: winners.per, reason: winners.per !== '-' ? explainRow('per', data1, data2, winners.per, '', '') : 'Data PER tidak lengkap (laba negatif atau data tidak tersedia).' },
    { key: 'pbv', label: 'PBV', a: data1.pbv != null ? `${data1.pbv.toFixed(2)}x` : 'N/A', b: data2.pbv != null ? `${data2.pbv.toFixed(2)}x` : 'N/A', winner: winners.pbv, reason: winners.pbv !== '-' ? explainRow('pbv', data1, data2, winners.pbv, '', '') : 'Data PBV tidak lengkap.' },
    { key: 'rsi', label: 'RSI (14)', a: data1.rsi != null ? data1.rsi.toFixed(1) : 'N/A', b: data2.rsi != null ? data2.rsi.toFixed(1) : 'N/A', winner: winners.rsi, reason: winners.rsi !== '-' ? explainRow('rsi', data1, data2, winners.rsi, '', '') : 'Data historis belum cukup untuk RSI.' },
    { key: 'rr', label: 'Risk/Reward (20D)', a: data1.rr != null ? `1:${data1.rr.toFixed(1)}` : 'N/A', b: data2.rr != null ? `1:${data2.rr.toFixed(1)}` : 'N/A', winner: winners.rr, reason: winners.rr !== '-' ? explainRow('rr', data1, data2, winners.rr, '', '') : 'Harga terlalu dekat/di bawah support 20 hari untuk dihitung.' },
  ];

  const winCount1 = Object.values(winners).filter((w) => w === data1.symbol).length;
  const winCount2 = Object.values(winners).filter((w) => w === data2.symbol).length;
  const overallWinner = winCount1 > winCount2 ? data1.symbol : winCount2 > winCount1 ? data2.symbol : null;
  const conclusion = overallWinner
    ? `Dari ${rows.length} metrik yang dibandingkan, ${overallWinner} unggul di ${Math.max(winCount1, winCount2)} metrik. ${overallWinner === data1.symbol ? data1.symbol : data2.symbol} tampak relatif lebih menarik saat ini, tapi tetap perhatikan metrik yang dimenangkan ${overallWinner === data1.symbol ? data2.symbol : data1.symbol} di atas sebagai konteks tambahan sebelum memutuskan.`
    : `${data1.symbol} dan ${data2.symbol} sama-sama unggul di ${winCount1} dari ${rows.length} metrik - keduanya punya profil risk/reward yang sebanding saat ini, pertimbangkan preferensi sektor/valuasi Anda.`;

  return NextResponse.json({
    data1: { symbol: data1.symbol, price: data1.price },
    data2: { symbol: data2.symbol, price: data2.price },
    rows,
    conclusion,
  });
}
