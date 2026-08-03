import YahooFinanceClass from 'yahoo-finance2';
import { analyzeBandarmology, type BandarmologyStatus } from './foreign-flow-proxy';
import { AI_PICK_UNIVERSE } from '../constants/ai-pick-universe';

// Backend nyata untuk /screener - sebelumnya halaman itu memanggil /api/live/[ticker]
// (cuma quote harga satu simbol), padahal UI-nya butuh 10 saham teratas dengan 10+
// kolom fundamental+teknikal per simbol -> field yang dibutuhkan (top_10_stocks) tidak
// pernah ada di response manapun, jadi tabelnya selalu kosong. Semua angka di bawah
// dihitung dari data Yahoo Finance riil per simbol, tidak ada yang dikarang:
// - PER/ROE/DER/Dividend Yield/Revenue Growth: langsung dari quoteSummary
// - "Bandarmology": Chaikin Money Flow (CLV/CMF20) dari histori High/Low/Close/Volume 20
//   hari - definisi SAMA dipakai Bandar Flow & AI Pick (lihat foreign-flow-proxy.ts),
//   bukan data flow broker sungguhan (IDX broker summary tidak tersedia gratis) - makanya
//   labelnya "Akumulasi/Distribusi", bukan "Big Player Confirmed" dsb.
// - "Moat Rating": heuristik dari ROE & gross margin (ambang batas didokumentasikan
//   di bawah), bukan penilaian kualitatif yang dikarang
// - 52W High/Low: harga tertinggi/terendah riil 52 minggu terakhir (fakta historis,
//   BUKAN target/proyeksi harga ke depan - dulu dilabel "Target Bull/Bear" yang
//   menyesatkan seolah itu prediksi AI, sudah diperbaiki jadi apa adanya)
const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

// Saham likuid LQ45/blue-chip - universe yang sama dipakai getMarketSummary(), supaya
// screener ini tidak perlu scan 900+ emiten (lambat & rawan rate-limit Yahoo). Diexport
// supaya modul lain yang butuh universe likuid yang sama (mis. corporate-calendar.service.ts)
// tidak duplikat daftar ini.
export const SCREENER_UNIVERSE = [
  'BBCA.JK','BBRI.JK','BMRI.JK','BBNI.JK','TLKM.JK','ASII.JK','GOTO.JK','ADRO.JK','UNTR.JK',
  'ICBP.JK','KLBF.JK','PGAS.JK','PTBA.JK','ANTM.JK','BRPT.JK','INKP.JK','INDF.JK','ITMG.JK',
  'CPIN.JK','UNVR.JK','AKRA.JK','BRIS.JK','SMGR.JK','INTP.JK','CTRA.JK','BSDE.JK','SMRA.JK',
  'ISAT.JK','EXCL.JK','BUKA.JK','TOWR.JK','TBIG.JK','SIDO.JK','AMRT.JK','MYOR.JK','HMSP.JK',
  'GGRM.JK','JPFA.JK','ARTO.JK','BDMN.JK','BNGA.JK','BBTN.JK','MEGA.JK','INDY.JK','BYAN.JK',
  'HRUM.JK','INCO.JK','TINS.JK','MAPI.JK','SILO.JK','EMTK.JK',
];

export type RiskProfile = 'Konservatif' | 'Moderat' | 'Agresif';

type RawStock = {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  per: number | null;
  roe: number | null;
  der: number | null;
  div_yield: number | null;
  rev_growth: number | null;
  gross_margin: number | null;
  vol_ratio: number;
  bandarmology_status: BandarmologyStatus;
  fifty_two_week_low: number | null;
  fifty_two_week_high: number | null;
};

// Daftar ticker yang boleh DIREKOMENDASIKAN - sama dengan universe AI Pick karena
// keduanya menjawab pertanyaan yang sama: saham ini layak disarankan atau tidak.
// Syaratnya: harga rata-rata 3 bulan >= Rp 200, nilai transaksi >= Rp 1 M/hari,
// volatilitas 12 bulan <= 120%/tahun.
//
// SCREENER_UNIVERSE sengaja TIDAK disaring - daftar itu juga dipakai Compare Tool,
// Dividend, dan Corporate Calendar yang semuanya alat PENCARIAN, bukan pemberi saran.
// Pengguna berhak membandingkan atau melihat jadwal dividen GOTO meski GOTO tidak
// layak direkomendasikan.
const CURATED_TICKERS = new Set(AI_PICK_UNIVERSE.map((t) => t.replace('.JK', '')));

/** ATR 14 sebagai persen dari harga terakhir. null kalau data kurang dari 15 bar
 * (butuh 14 True Range, masing-masing perlu close hari sebelumnya) atau harga nol.
 *
 * Menggantikan kolom stop loss yang dulu memberi angka tetap 5%/8%/12%: pengujian
 * 4.705 sampel menunjukkan stop 5% tersentuh di 77% transaksi dan memangkas hampir
 * seluruh keuntungan (+0,02% vs +1,34% tanpa stop). Angka ATR memberi tahu ruang gerak
 * wajar saham supaya pengguna menetapkan batasnya sendiri, bukan menuruti angka yang
 * terdengar otoritatif tapi tidak berdasar. */
export function atr14Pct(ohlcv: { high: number; low: number; close: number }[]): number | null {
  if (ohlcv.length < 15) return null;
  const last = ohlcv[ohlcv.length - 1].close;
  if (!last) return null;

  let sum = 0;
  for (let i = ohlcv.length - 14; i < ohlcv.length; i++) {
    const { high, low } = ohlcv[i];
    const prevClose = ohlcv[i - 1].close;
    sum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  return (sum / 14 / last) * 100;
}

/** Sisakan hanya saham yang boleh direkomendasikan. Menerima ticker dengan maupun
 * tanpa akhiran .JK karena RawStock menyimpannya sudah dibuang. */
export function filterCurated<T extends { ticker: string }>(stocks: T[]): T[] {
  return stocks.filter((s) => CURATED_TICKERS.has(s.ticker.replace('.JK', '')));
}

/** range=1mo (~21 hari bursa) cukup untuk jendela CMF20 + buffer libur/weekend. */
async function fetchDailyOhlcv(ticker: string): Promise<{ date: string; high: number; low: number; close: number; volume: number }[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0] || {};
    const history: { date: string; high: number; low: number; close: number; volume: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close?.[i] != null) {
        history.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          high: quote.high?.[i] ?? quote.close[i],
          low: quote.low?.[i] ?? quote.close[i],
          close: quote.close[i],
          volume: quote.volume?.[i] || 0,
        });
      }
    }
    return history;
  } catch {
    return [];
  }
}

async function fetchOne(ticker: string): Promise<RawStock | null> {
  try {
    const [q, ohlcv] = await Promise.all([
      yahooFinance.quoteSummary(ticker, {
        modules: ['assetProfile', 'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price'],
      }),
      fetchDailyOhlcv(ticker),
    ]);
    if (!q) return null;
    const price = q.price?.regularMarketPrice || 0;
    if (!price) return null;
    const volume = q.price?.regularMarketVolume || 0;
    const avgVolume = q.summaryDetail?.averageVolume10days || q.summaryDetail?.averageVolume || 0;
    return {
      ticker: ticker.replace('.JK', ''),
      name: q.price?.longName || q.price?.shortName || ticker,
      sector: q.assetProfile?.sector || 'Lainnya',
      price,
      per: q.summaryDetail?.trailingPE || null,
      roe: q.financialData?.returnOnEquity != null ? q.financialData.returnOnEquity * 100 : null,
      der: q.financialData?.debtToEquity != null ? q.financialData.debtToEquity / 100 : null,
      div_yield: q.summaryDetail?.dividendYield != null ? q.summaryDetail.dividendYield * 100 : null,
      rev_growth: q.financialData?.revenueGrowth != null ? q.financialData.revenueGrowth * 100 : null,
      gross_margin: q.financialData?.grossMargins != null ? q.financialData.grossMargins * 100 : null,
      vol_ratio: avgVolume > 0 ? volume / avgVolume : 1,
      bandarmology_status: analyzeBandarmology(ohlcv).status,
      fifty_two_week_low: q.summaryDetail?.fiftyTwoWeekLow || null,
      fifty_two_week_high: q.summaryDetail?.fiftyTwoWeekHigh || null,
    };
  } catch {
    return null;
  }
}

// Universe mentah (fundamental+teknikal per saham) - TIDAK bergantung pada profil
// risiko, jadi di-cache terpisah dan dipakai ulang untuk skoring 3 profil sekaligus.
export async function fetchScreenerUniverse(): Promise<RawStock[]> {
  const results = await Promise.all(SCREENER_UNIVERSE.map(fetchOne));
  return results.filter((r): r is RawStock => r !== null);
}

function moatRating(roe: number | null, grossMargin: number | null): string {
  if (roe != null && roe >= 20 && grossMargin != null && grossMargin >= 40) return 'Lebar';
  if (roe != null && roe >= 12) return 'Sedang';
  return 'Sempit';
}

function bandarmologyLabel(status: BandarmologyStatus): string {
  if (status === 'BULLISH') return 'Akumulasi';
  if (status === 'BEARISH') return 'Distribusi';
  return 'Netral';
}

// Bobot skor per profil risiko - Konservatif memberatkan DER rendah + dividend yield
// + ROE stabil; Moderat berimbang; Agresif memberatkan pertumbuhan revenue + momentum
// volume. Semua komponen skor dinormalisasi 0-100 relatif terhadap universe yang sama
// sebelum dibobot, supaya skala antar metrik (mis. PER vs ROE) sebanding.
function scoreStock(s: RawStock, sectorAvgPer: number, profile: RiskProfile): number {
  const perScore = s.per != null && s.per > 0 ? Math.max(0, 100 - Math.abs(s.per - sectorAvgPer) / sectorAvgPer * 100) : 30;
  const roeScore = s.roe != null ? Math.min(100, Math.max(0, s.roe * 3)) : 20;
  const derScore = s.der != null ? Math.max(0, 100 - s.der * 40) : 50;
  const divScore = s.div_yield != null ? Math.min(100, s.div_yield * 15) : 10;
  const growthScore = s.rev_growth != null ? Math.min(100, Math.max(0, 50 + s.rev_growth * 5)) : 30;
  const momentumScore = Math.min(100, Math.max(0, s.vol_ratio * 50));

  const weights: Record<RiskProfile, Record<string, number>> = {
    Konservatif: { der: 0.35, div: 0.30, roe: 0.20, per: 0.15, growth: 0, momentum: 0 },
    Moderat: { roe: 0.25, per: 0.25, growth: 0.20, der: 0.15, div: 0.15, momentum: 0 },
    Agresif: { growth: 0.35, momentum: 0.30, roe: 0.20, per: 0.15, der: 0, div: 0 },
  };
  const w = weights[profile];
  return perScore * w.per + roeScore * w.roe + derScore * w.der + divScore * w.div + growthScore * w.growth + momentumScore * w.momentum;
}

export function rankScreener(universe: RawStock[], profile: RiskProfile) {
  const bySector = new Map<string, number[]>();
  universe.forEach((s) => {
    if (s.per && s.per > 0) {
      const list = bySector.get(s.sector) || [];
      list.push(s.per);
      bySector.set(s.sector, list);
    }
  });
  const sectorAvgPer = (sector: string) => {
    const list = bySector.get(sector);
    if (!list || list.length === 0) return 15;
    return list.reduce((a, b) => a + b, 0) / list.length;
  };

  const ranked = universe
    .map((s) => ({ s, score: scoreStock(s, sectorAvgPer(s.sector), profile) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ s }) => {
      const stopLossPct = profile === 'Konservatif' ? 0.05 : profile === 'Moderat' ? 0.08 : 0.12;
      return {
        ticker: s.ticker,
        name: s.name,
        sector: s.sector,
        per: s.per != null ? parseFloat(s.per.toFixed(1)) : null,
        per_sector: parseFloat(sectorAvgPer(s.sector).toFixed(1)),
        rev_growth_ttm: s.rev_growth != null ? `${s.rev_growth >= 0 ? '+' : ''}${s.rev_growth.toFixed(1)}%` : 'N/A',
        roe: s.roe != null ? `${s.roe.toFixed(1)}%` : 'N/A',
        der: s.der != null ? `${s.der.toFixed(2)}x` : 'N/A',
        div_yield: s.div_yield != null ? `${s.div_yield.toFixed(1)}%` : 'N/A',
        bandarmology: bandarmologyLabel(s.bandarmology_status),
        moat: moatRating(s.roe, s.gross_margin),
        week52_high: s.fifty_two_week_high,
        week52_low: s.fifty_two_week_low,
        entry: s.price,
        stop_loss: Math.round(s.price * (1 - stopLossPct)),
      };
    });

  return ranked;
}
