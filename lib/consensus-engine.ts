/**
 * SahamLens Consensus Engine
 * 
 * Menghitung konsensus akhir dari N model/analyzer menggunakan:
 * - Median skor (bukan rata-rata, agar tidak tertarik outlier)
 * - Voting Bull:Bear
 * 
 * ATURAN:
 * - Jika >= 80% model bilang BUY/STRONG BUY → Konsensus STRONG BUY
 * - Jika >= 60% model bilang BUY → Konsensus BUY
 * - Jika >= 60% model bilang SELL → Konsensus SELL
 * - Jika >= 80% model bilang SELL → Konsensus STRONG SELL
 * - Selain itu → HOLD
 * - Skor asli model TIDAK diubah, hanya digabungkan.
 */

interface AnalyzerVote {
  label: string;
  decision: string;      // 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: number;    // 0-100
}

interface ConsensusResult {
  konsensus: string;            // e.g. "STRONG BUY (80%)"
  vote: string;                 // e.g. "8:2"
  median_skor: number;          // median confidence
  bull_count: number;
  bear_count: number;
  neutral_count: number;
  total_models: number;
  bull_pct: number;             // percentage bullish
  kategori: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

export function calculateConsensus(analyzers: AnalyzerVote[]): ConsensusResult {
  if (!analyzers || analyzers.length === 0) {
    return {
      konsensus: 'AWAITING',
      vote: '0:0',
      median_skor: 0,
      bull_count: 0,
      bear_count: 0,
      neutral_count: 0,
      total_models: 0,
      bull_pct: 0,
      kategori: 'HOLD'
    };
  }

  let bullCount = 0;
  let bearCount = 0;
  let neutralCount = 0;
  const allConfidences: number[] = [];

  analyzers.forEach(a => {
    allConfidences.push(a.confidence);
    if (a.decision === 'BULLISH') bullCount++;
    else if (a.decision === 'BEARISH') bearCount++;
    else neutralCount++;
  });

  const totalModels = analyzers.length;
  const medianSkor = getMedian(allConfidences);

  // Voting percentage
  const bullPct = Math.round((bullCount / totalModels) * 100);
  const bearPct = Math.round((bearCount / totalModels) * 100);

  // Determine kategori berdasarkan voting
  let kategori: ConsensusResult['kategori'] = 'HOLD';
  let konsensusLabel = '';

  if (bullPct >= 80) {
    kategori = 'STRONG BUY';
    konsensusLabel = `STRONG BUY (${bullPct}%)`;
  } else if (bullPct >= 60) {
    kategori = 'BUY';
    konsensusLabel = `BUY (${bullPct}%)`;
  } else if (bearPct >= 80) {
    kategori = 'STRONG SELL';
    konsensusLabel = `STRONG SELL (${bearPct}%)`;
  } else if (bearPct >= 60) {
    kategori = 'SELL';
    konsensusLabel = `SELL (${bearPct}%)`;
  } else {
    kategori = 'HOLD';
    konsensusLabel = `HOLD (Bull ${bullPct}% : Bear ${bearPct}%)`;
  }

  return {
    konsensus: konsensusLabel,
    vote: `${bullCount}:${bearCount}`,
    median_skor: medianSkor,
    bull_count: bullCount,
    bear_count: bearCount,
    neutral_count: neutralCount,
    total_models: totalModels,
    bull_pct: bullPct,
    kategori
  };
}
