/**
 * SahamLens Scoring Engine - IDX Algorithmic Suite
 * 
 * Menghitung skor komposit 0-100 berdasarkan 3 kategori:
 * - Technical Score (0-40)
 * - Fundamental Score (0-30)
 * - Flow Score (0-30)
 * 
 * ATURAN: Hanya INTERPRETASI data input dari analyzer.
 * TIDAK pernah menghitung indikator manual.
 * Jika data null/kosong → skor 0, bukan tebakan.
 */

interface TechnicalInput {
  currentPrice: number;
  ma20: number;
  ma50: number;
  ma200: number;
  rsi: number;
  macdHist: number;
  macdLine: number;
  macdSignal: number;
  volToday: number;
  volAvg20: number;
}

interface FundamentalInput {
  per: number | null;
  pbv: number | null;
  roe: number | null;  // already in % (e.g. 18.2)
  der: number | null;  // ratio (e.g. 0.4)
  currentRatio: number | null;
  revenueGrowth: number | null; // yoy %
}

interface FlowInput {
  foreignFlow: string;       // 'STRONG NET BUY' | 'NET BUY' | 'NEUTRAL' | 'NET SELL' | 'STRONG NET SELL'
  consecutiveBuyDays: number;
  consecutiveSellDays: number;
  volRatio: number;
}

interface ScoringResult {
  simbol: string;
  harga: number;
  technical_score: number;
  fundamental_score: number;
  flow_score: number;
  total_score: number;
  kategori: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL';
  detail: {
    ma_trend: number;
    rsi_macd: number;
    volume: number;
    valuasi: number;
    profitabilitas: number;
    kesehatan: number;
    asing: number;
    bandar: number;
  };
  alasan_3_poin: string[];
  risk: string;
}

// ==================== STEP 1: TECHNICAL SCORE (0-40) ====================

function scoreMATrend(t: TechnicalInput): { score: number; reason: string } {
  if (!t.currentPrice || !t.ma20 || !t.ma50 || !t.ma200) {
    return { score: 0, reason: 'DATA TIDAK LENGKAP' };
  }

  // Perfect uptrend: Price > MA20 > MA50 > MA200
  if (t.currentPrice > t.ma20 && t.ma20 > t.ma50 && t.ma50 > t.ma200) {
    return { score: 15, reason: `Uptrend sempurna P:${t.currentPrice} > MA20:${Math.round(t.ma20)} > MA50:${Math.round(t.ma50)} > MA200:${Math.round(t.ma200)}` };
  }
  // Price above MA20 and MA50 but MA50 < MA200
  if (t.currentPrice > t.ma20 && t.currentPrice > t.ma50) {
    return { score: 10, reason: `Harga di atas MA20 & MA50, tapi belum full uptrend` };
  }
  // Price above MA200 only
  if (t.currentPrice > t.ma200) {
    return { score: 5, reason: `Harga di atas MA200 tapi di bawah MA20/MA50` };
  }
  // Full downtrend
  if (t.currentPrice < t.ma20 && t.ma20 < t.ma50 && t.ma50 < t.ma200) {
    return { score: 0, reason: `Downtrend penuh P < MA20 < MA50 < MA200` };
  }
  return { score: 3, reason: `Sideways / tidak ada tren jelas` };
}

function scoreRsiMacd(t: TechnicalInput): { score: number; reason: string } {
  let score = 0;
  const parts: string[] = [];

  // RSI (0-8 poin) - IDX Threshold
  if (t.rsi >= 50 && t.rsi <= 70) {
    score += 8;
    parts.push(`RSI ${t.rsi.toFixed(1)} zona BUY ideal`);
  } else if (t.rsi >= 40 && t.rsi < 50) {
    score += 4;
    parts.push(`RSI ${t.rsi.toFixed(1)} netral-lemah`);
  } else if (t.rsi > 70 && t.rsi <= 78) {
    score += 5;
    parts.push(`RSI ${t.rsi.toFixed(1)} mendekati overbought`);
  } else if (t.rsi > 78) {
    score += 0;
    parts.push(`RSI ${t.rsi.toFixed(1)} OVERBOUGHT zona SELL`);
  } else if (t.rsi < 40) {
    score += 2; // Oversold bisa reversal tapi berisiko
    parts.push(`RSI ${t.rsi.toFixed(1)} OVERSOLD zona SELL/hati-hati`);
  }

  // MACD (0-7 poin) - IDX Threshold: histogram > 0 DAN MACD > Signal
  if (t.macdHist > 0 && t.macdLine > t.macdSignal) {
    score += 7;
    parts.push(`MACD bullish (Hist:${t.macdHist.toFixed(2)})`);
  } else if (t.macdHist > 0 || t.macdLine > t.macdSignal) {
    score += 3;
    parts.push(`MACD mixed signal`);
  } else {
    score += 0;
    parts.push(`MACD bearish`);
  }

  return { score: Math.min(15, score), reason: parts.join(', ') };
}

function scoreVolume(t: TechnicalInput): { score: number; reason: string } {
  if (!t.volToday || !t.volAvg20) {
    return { score: 0, reason: 'DATA TIDAK LENGKAP' };
  }

  const ratio = t.volToday / t.volAvg20;

  // IDX Threshold: Volume valid > 1.5x AVG 20D
  if (ratio >= 2.0) {
    return { score: 10, reason: `Volume ${ratio.toFixed(1)}x avg (SANGAT TINGGI)` };
  }
  if (ratio >= 1.5) {
    return { score: 8, reason: `Volume ${ratio.toFixed(1)}x avg (VALID)` };
  }
  if (ratio >= 1.0) {
    return { score: 4, reason: `Volume ${ratio.toFixed(1)}x avg (NORMAL)` };
  }
  return { score: 1, reason: `Volume ${ratio.toFixed(1)}x avg (RENDAH)` };
}

// ==================== STEP 2: FUNDAMENTAL SCORE (0-30) ====================

function scoreValuasi(f: FundamentalInput): { score: number; reason: string } {
  if (f.per === null && f.pbv === null) {
    return { score: 0, reason: 'DATA TIDAK LENGKAP' };
  }

  let score = 0;
  const parts: string[] = [];

  // PER < 15 = SEHAT (IDX Threshold)
  if (f.per !== null) {
    if (f.per > 0 && f.per < 10) { score += 5; parts.push(`PER ${f.per.toFixed(1)}x (murah)`); }
    else if (f.per >= 10 && f.per < 15) { score += 4; parts.push(`PER ${f.per.toFixed(1)}x (wajar)`); }
    else if (f.per >= 15 && f.per < 25) { score += 2; parts.push(`PER ${f.per.toFixed(1)}x (agak mahal)`); }
    else if (f.per >= 25) { score += 0; parts.push(`PER ${f.per.toFixed(1)}x (mahal)`); }
    else { score += 1; parts.push(`PER ${f.per.toFixed(1)}x (negatif/rugi)`); }
  }

  // PBV < 1 = Murah
  if (f.pbv !== null) {
    if (f.pbv < 1) { score += 5; parts.push(`PBV ${f.pbv.toFixed(2)}x (di bawah book)`); }
    else if (f.pbv < 2) { score += 3; parts.push(`PBV ${f.pbv.toFixed(2)}x (wajar)`); }
    else { score += 1; parts.push(`PBV ${f.pbv.toFixed(2)}x (premium)`); }
  }

  return { score: Math.min(10, score), reason: parts.join(', ') };
}

function scoreProfitabilitas(f: FundamentalInput): { score: number; reason: string } {
  let score = 0;
  const parts: string[] = [];

  // ROE > 15% = SEHAT (IDX Threshold)
  if (f.roe !== null) {
    if (f.roe > 20) { score += 5; parts.push(`ROE ${f.roe.toFixed(1)}% (sangat baik)`); }
    else if (f.roe >= 15) { score += 4; parts.push(`ROE ${f.roe.toFixed(1)}% (sehat)`); }
    else if (f.roe >= 8) { score += 2; parts.push(`ROE ${f.roe.toFixed(1)}% (cukup)`); }
    else { score += 0; parts.push(`ROE ${f.roe.toFixed(1)}% (lemah)`); }
  }

  // Revenue Growth YoY
  if (f.revenueGrowth !== null) {
    if (f.revenueGrowth > 15) { score += 5; parts.push(`Rev Growth ${f.revenueGrowth.toFixed(0)}% (tinggi)`); }
    else if (f.revenueGrowth > 5) { score += 3; parts.push(`Rev Growth ${f.revenueGrowth.toFixed(0)}% (stabil)`); }
    else if (f.revenueGrowth > 0) { score += 1; parts.push(`Rev Growth ${f.revenueGrowth.toFixed(0)}% (lambat)`); }
    else { score += 0; parts.push(`Rev Growth ${f.revenueGrowth.toFixed(0)}% (negatif)`); }
  }

  return { score: Math.min(10, score), reason: parts.join(', ') };
}

function scoreKesehatan(f: FundamentalInput): { score: number; reason: string } {
  let score = 0;
  const parts: string[] = [];

  // DER < 1 = SEHAT (IDX Threshold, non-finance)
  if (f.der !== null) {
    if (f.der < 0.5) { score += 5; parts.push(`DER ${f.der.toFixed(2)}x (konservatif)`); }
    else if (f.der < 1.0) { score += 4; parts.push(`DER ${f.der.toFixed(2)}x (sehat)`); }
    else if (f.der < 2.0) { score += 2; parts.push(`DER ${f.der.toFixed(2)}x (agak tinggi)`); }
    else { score += 0; parts.push(`DER ${f.der.toFixed(2)}x (berisiko tinggi)`); }
  }

  // Current Ratio > 1.5 = SEHAT (IDX Threshold)
  if (f.currentRatio !== null) {
    if (f.currentRatio > 2.0) { score += 5; parts.push(`CR ${f.currentRatio.toFixed(2)}x (sangat likuid)`); }
    else if (f.currentRatio >= 1.5) { score += 4; parts.push(`CR ${f.currentRatio.toFixed(2)}x (sehat)`); }
    else if (f.currentRatio >= 1.0) { score += 2; parts.push(`CR ${f.currentRatio.toFixed(2)}x (cukup)`); }
    else { score += 0; parts.push(`CR ${f.currentRatio.toFixed(2)}x (risiko likuiditas)`); }
  }

  return { score: Math.min(10, score), reason: parts.join(', ') };
}

// ==================== STEP 3: FLOW SCORE (0-30) ====================

function scoreAsing(flow: FlowInput): { score: number; reason: string } {
  // IDX Threshold: STRONG NET BUY jika Net Foreign Buy > 5 hari berturut
  if (flow.foreignFlow === 'STRONG NET BUY' && flow.consecutiveBuyDays >= 4) {
    return { score: 15, reason: `Asing STRONG NET BUY ${flow.consecutiveBuyDays + 1}D berturut` };
  }
  if (flow.foreignFlow === 'STRONG NET BUY') {
    return { score: 12, reason: `Asing STRONG NET BUY` };
  }
  if (flow.foreignFlow === 'NET BUY' && flow.volRatio > 1.5) {
    return { score: 10, reason: `Asing NET BUY + volume tinggi ${flow.volRatio.toFixed(1)}x` };
  }
  if (flow.foreignFlow === 'NET BUY') {
    return { score: 8, reason: `Asing NET BUY` };
  }
  if (flow.foreignFlow === 'NEUTRAL') {
    return { score: 5, reason: `Asing NEUTRAL` };
  }
  if (flow.foreignFlow === 'NET SELL') {
    return { score: 2, reason: `Asing NET SELL (distribusi)` };
  }
  if (flow.foreignFlow === 'STRONG NET SELL') {
    return { score: 0, reason: `Asing STRONG NET SELL (distribusi berat)` };
  }
  return { score: 5, reason: 'Asing N/A' };
}

function scoreBandar(flow: FlowInput): { score: number; reason: string } {
  // Bandar/broker accumulation estimated from volume + price action
  // Strong volume with price up = accumulation
  if (flow.volRatio >= 2.0 && flow.foreignFlow.includes('BUY')) {
    return { score: 15, reason: `Akumulasi kuat (Vol ${flow.volRatio.toFixed(1)}x + Net Buy)` };
  }
  if (flow.volRatio >= 1.5 && flow.foreignFlow.includes('BUY')) {
    return { score: 12, reason: `Akumulasi (Vol ${flow.volRatio.toFixed(1)}x + Net Buy)` };
  }
  if (flow.volRatio >= 1.5) {
    return { score: 8, reason: `Volume tinggi ${flow.volRatio.toFixed(1)}x, perlu konfirmasi arah` };
  }
  if (flow.volRatio >= 1.0) {
    return { score: 5, reason: `Volume normal` };
  }
  return { score: 2, reason: `Volume rendah (${flow.volRatio.toFixed(1)}x), kurang minat` };
}

// ==================== STEP 4: FINAL SCORING ====================

function getKategori(total: number): 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' {
  if (total > 75) return 'STRONG BUY';
  if (total >= 60) return 'BUY';
  if (total >= 45) return 'HOLD';
  return 'SELL';
}

export function calculateScore(
  simbol: string,
  technical: TechnicalInput,
  fundamental: FundamentalInput,
  flow: FlowInput
): ScoringResult {
  // Step 1
  const maTrend = scoreMATrend(technical);
  const rsiMacd = scoreRsiMacd(technical);
  const volume = scoreVolume(technical);
  const technicalScore = maTrend.score + rsiMacd.score + volume.score;

  // Step 2
  const valuasi = scoreValuasi(fundamental);
  const profitabilitas = scoreProfitabilitas(fundamental);
  const kesehatan = scoreKesehatan(fundamental);
  const fundamentalScore = valuasi.score + profitabilitas.score + kesehatan.score;

  // Step 3
  const asing = scoreAsing(flow);
  const bandar = scoreBandar(flow);
  const flowScore = asing.score + bandar.score;

  // Step 4
  const totalScore = technicalScore + fundamentalScore + flowScore;
  const kategori = getKategori(totalScore);

  // Generate top 3 reasons
  const allReasons = [
    { score: maTrend.score, reason: maTrend.reason },
    { score: rsiMacd.score, reason: rsiMacd.reason },
    { score: volume.score, reason: volume.reason },
    { score: valuasi.score, reason: valuasi.reason },
    { score: profitabilitas.score, reason: profitabilitas.reason },
    { score: kesehatan.score, reason: kesehatan.reason },
    { score: asing.score, reason: asing.reason },
    { score: bandar.score, reason: bandar.reason }
  ].sort((a, b) => b.score - a.score);

  const alasan3 = allReasons.slice(0, 3).map(r => r.reason);

  // Risk assessment
  let risk = '';
  if (technical.ma20 && technical.currentPrice) {
    const supportDist = ((technical.currentPrice - technical.ma20) / technical.currentPrice * 100);
    risk = `Support MA20 di ${Math.round(technical.ma20)} (${supportDist > 0 ? '-' : '+'}${Math.abs(supportDist).toFixed(1)}%)`;
  }
  if (technical.rsi > 78) {
    risk += ` | OVERBOUGHT RSI ${technical.rsi.toFixed(1)}`;
  }

  return {
    simbol,
    harga: technical.currentPrice,
    technical_score: technicalScore,
    fundamental_score: fundamentalScore,
    flow_score: flowScore,
    total_score: totalScore,
    kategori,
    detail: {
      ma_trend: maTrend.score,
      rsi_macd: rsiMacd.score,
      volume: volume.score,
      valuasi: valuasi.score,
      profitabilitas: profitabilitas.score,
      kesehatan: kesehatan.score,
      asing: asing.score,
      bandar: bandar.score
    },
    alasan_3_poin: alasan3,
    risk
  };
}
