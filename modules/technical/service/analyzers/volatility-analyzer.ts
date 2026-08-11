import { ATR_PERIOD, calculateWilderAtr } from '../atr';

// `raw.atr` (angka asli, temuan M-03) disediakan supaya pemanggil (app/api/council/
// route.ts) tidak perlu parse string `value`.
//
// BUG FIX (audit kuantitatif 2026-08-11, temuan C-01): ATR di sini dulu dihitung sebagai
// RATA-RATA ARITMATIK SEDERHANA dari 14 True Range terakhir, sementara TP/CL Validation
// Lab mengukur setup memakai Wilder smoothing. Selisihnya -5% s/d -14% pada saham nyata,
// dan karena angka ini masuk langsung ke stop loss & target harga lewat
// buildLongTradingSetup(), lab itu memvalidasi setup yang tidak pernah dikirim ke
// pengguna. Sekarang satu implementasi baku dipakai keduanya - lihat modules/technical/
// service/atr.ts untuk bukti empirisnya.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < ATR_PERIOD + 1) return { label: 'Volatility (ATR)', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { atr: null as number | null } };

  // FASE 3: ATR adalah indikator OHLC-dependent/trading-risk, jadi satu basis RAW:
  // High/Low raw dibanding prev Close raw. Dilarang mencampur High/Low raw dengan
  // AdjClose karena true range akan palsu di sekitar corporate action.
  const atr = calculateWilderAtr(history.map((h) => ({ high: h.High, low: h.Low, close: h.Close })));
  if (atr == null || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return { label: 'Volatility (ATR)', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { atr: null as number | null } };
  }
  const volatilityPct = (atr / currentPrice) * 100;

  // BUG FIX (audit integritas data 2026-08-03, temuan H-08): sebelumnya volatilitas
  // TINGGI divote BEARISH dan volatilitas RENDAH divote BULLISH - tapi ATR mengukur
  // BESARAN pergerakan harga, bukan ARAHNYA. Saham yang melonjak +8% dan saham yang
  // anjlok -8% punya ATR yang sama persis dan dulu diberi vote BEARISH yang sama. Vote
  // arah palsu ini ikut ditimbang di calculateConsensus() (bobot sama dengan RSI/MACD)
  // dan sebagai risk_agent (bobot 10%) di orchestrator - efeknya saham blue-chip yang
  // lamban selalu dapat vote BULLISH gratis, saham small-cap yang volatil selalu
  // BEARISH, terlepas dari tren/fundamentalnya. Sekarang decision SELALU NEUTRAL (tidak
  // ikut ditimbang sebagai bull/bear di consensus) - label & confidence tetap
  // melaporkan besaran volatilitas untuk konteks risiko, bukan sebagai sinyal arah.
  const confidence = volatilityPct > 3
    ? Math.min(90, 50 + volatilityPct * 5)
    : volatilityPct < 1.5
      ? Math.min(90, 50 + (1.5 - volatilityPct) * 20)
      : 50;

  return {
    // Label literal, BUKAN template: string ini dipakai sebagai kunci pemetaan dimensi
    // di consensus.service.ts dan sebagai IndicatorName di modul backtest.
    label: 'Volatility (ATR 14)',
    value: `ATR: ${atr.toFixed(0)} (${volatilityPct.toFixed(2)}%)`,
    decision: 'NEUTRAL',
    confidence: Math.round(confidence),
    raw: { atr },
  };
}
