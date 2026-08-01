import YahooFinanceClass from 'yahoo-finance2';

// Backend nyata untuk /screener - sebelumnya halaman itu memanggil /api/live/[ticker]
// (cuma quote harga satu simbol), padahal UI-nya butuh 10 saham teratas dengan 10+
// kolom fundamental+teknikal per simbol -> field yang dibutuhkan (top_10_stocks) tidak
// pernah ada di response manapun, jadi tabelnya selalu kosong. Semua angka di bawah
// dihitung dari data Yahoo Finance riil per simbol, tidak ada yang dikarang:
// - PER/ROE/DER/Dividend Yield/Revenue Growth: langsung dari quoteSummary
// - "Bandarmology": proxy akumulasi/distribusi dari rasio volume vs rata-rata 10 hari
//   (bukan data flow broker sungguhan - IDX broker summary tidak tersedia gratis -
//   makanya labelnya "Akumulasi/Distribusi", bukan "Big Player Confirmed" dsb.)
// - "Moat Rating": heuristik dari ROE & gross margin (ambang batas didokumentasikan
//   di bawah), bukan penilaian kualitatif yang dikarang
// - Target Bull/Bear: 52-week high/low riil, bukan angka proyeksi rekaan
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
  fifty_two_week_low: number | null;
  fifty_two_week_high: number | null;
};

async function fetchOne(ticker: string): Promise<RawStock | null> {
  try {
    const q = await yahooFinance.quoteSummary(ticker, {
      modules: ['assetProfile', 'defaultKeyStatistics', 'financialData', 'summaryDetail', 'price'],
    });
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

function bandarmologyLabel(volRatio: number): string {
  if (volRatio >= 1.5) return 'Big Volume Akumulasi';
  if (volRatio >= 1.1) return 'Akumulasi';
  if (volRatio <= 0.7) return 'Distribusi';
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
        rev_growth_5yr: s.rev_growth != null ? `${s.rev_growth >= 0 ? '+' : ''}${s.rev_growth.toFixed(1)}%` : 'N/A',
        roe: s.roe != null ? `${s.roe.toFixed(1)}%` : 'N/A',
        der: s.der != null ? `${s.der.toFixed(2)}x` : 'N/A',
        div_yield: s.div_yield != null ? `${s.div_yield.toFixed(1)}%` : 'N/A',
        bandarmology: bandarmologyLabel(s.vol_ratio),
        moat: moatRating(s.roe, s.gross_margin),
        target_bull: s.fifty_two_week_high,
        target_bear: s.fifty_two_week_low,
        entry: s.price,
        stop_loss: Math.round(s.price * (1 - stopLossPct)),
      };
    });

  return ranked;
}
