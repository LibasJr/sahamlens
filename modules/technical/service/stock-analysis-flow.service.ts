import {
  analyzeAccumulationSignal,
  analyzeBandarmology,
  analyzeOfficialForeignFlow,
  computeAccumulationStreak,
  computeDailyNetFlow,
  getRealForeignFlow,
} from '@/modules/market';

export interface StockAnalysisFlowMetrics {
  flowPressure20: number | null;
  flowPressureToday: number | null;
  officialUsable: boolean;
  accumulationStatus: 'AKUMULASI' | 'DISTRIBUSI' | 'NETRAL' | null;
  consecutiveBuyDays: number;
  consecutiveSellDays: number;
  mfmPositiveRatio20: number | null;
}

/**
 * Adds the two flow analyzers to the analyzer collection and returns normalized metrics
 * consumed by the scoring engine. IDX official foreign-flow data wins whenever usable;
 * OHLCV-derived CMF remains a clearly labelled fallback.
 */
export function appendStockFlowAnalyzers(
  ticker: string,
  analyzerHistory: any[],
  analyzersResult: any[],
): StockAnalysisFlowMetrics {
  const flowHistory = analyzerHistory.map((h: any) => ({
    date: h.Date.split('T')[0],
    high: h.High,
    low: h.Low,
    close: h.Close,
    volume: h.Volume,
  }));

  const dailyFlow = computeDailyNetFlow(flowHistory).slice(-20);
  const net5D = dailyFlow.slice(-5).reduce((sum, day) => sum + day.netValueBillion, 0);
  const buyStreak = computeAccumulationStreak(dailyFlow);
  let sellStreak = 0;
  for (let i = dailyFlow.length - 1; i >= 0; i--) {
    if (dailyFlow[i].netValueBillion < 0) sellStreak++;
    else break;
  }

  const accumulation = analyzeAccumulationSignal(flowHistory.slice(-20));
  const flowProxyAvailable = accumulation.status != null && dailyFlow.length > 0;
  let foreignFlowStatus:
    | 'STRONG NET BUY'
    | 'NET BUY'
    | 'NEUTRAL'
    | 'NET SELL'
    | 'STRONG NET SELL'
    | 'UNAVAILABLE' = flowProxyAvailable ? 'NEUTRAL' : 'UNAVAILABLE';
  let ffDecision = 'NEUTRAL';
  let ffConfidence = 0;

  if (accumulation.status === 'AKUMULASI') {
    foreignFlowStatus = buyStreak >= 4 ? 'STRONG NET BUY' : 'NET BUY';
    ffDecision = 'BULLISH';
    ffConfidence = buyStreak >= 4 ? 80 : 65;
  } else if (accumulation.status === 'DISTRIBUSI') {
    foreignFlowStatus = sellStreak >= 4 ? 'STRONG NET SELL' : 'NET SELL';
    ffDecision = 'BEARISH';
    ffConfidence = sellStreak >= 4 ? 80 : 65;
  } else if (flowProxyAvailable) {
    ffConfidence = 50;
  }

  const foreignFlow = !flowProxyAvailable
    ? 'N/A (proxy OHLCV tidak tersedia)'
    : `${foreignFlowStatus} | Net 5D: ${net5D >= 0 ? '+' : ''}${net5D.toFixed(2)}M | Streak: ${buyStreak > 0 ? `${buyStreak}D akumulasi` : sellStreak > 0 ? `${sellStreak}D distribusi` : 'netral'}`;

  const officialSeries = getRealForeignFlow(ticker, 20);
  const official = officialSeries ? analyzeOfficialForeignFlow(officialSeries.history) : null;
  const officialUsable = official != null && official.netPressure20 != null;
  const consecutiveBuyDays = officialUsable ? official.consecutiveBuyDays : buyStreak;
  const consecutiveSellDays = officialUsable ? official.consecutiveSellDays : sellStreak;

  if (officialUsable) {
    const officialNet5D = official.net5DBillion ?? 0;
    const streakLabel = official.consecutiveBuyDays > 0
      ? `${official.consecutiveBuyDays}D akumulasi`
      : official.consecutiveSellDays > 0
        ? `${official.consecutiveSellDays}D distribusi`
        : 'netral';
    const statusLabel = official.accumulationStatus === 'AKUMULASI'
      ? (official.consecutiveBuyDays >= 4 ? 'STRONG NET BUY' : 'NET BUY')
      : official.accumulationStatus === 'DISTRIBUSI'
        ? (official.consecutiveSellDays >= 4 ? 'STRONG NET SELL' : 'NET SELL')
        : 'NEUTRAL';

    analyzersResult.push({
      dimension: 'FLOW',
      label: 'LensFlow (Arus Dana Asing)',
      value: `${statusLabel} | Net 5D: ${officialNet5D >= 0 ? '+' : ''}${officialNet5D.toFixed(2)}M | Streak: ${streakLabel}`,
      decision: official.accumulationStatus === 'AKUMULASI'
        ? 'BULLISH'
        : official.accumulationStatus === 'DISTRIBUSI'
          ? 'BEARISH'
          : 'NEUTRAL',
      confidence: official.accumulationStatus === 'NETRAL'
        ? 50
        : Math.max(official.consecutiveBuyDays, official.consecutiveSellDays) >= 4
          ? 80
          : 65,
    });
  } else {
    analyzersResult.push({
      dimension: 'FLOW',
      label: 'LensFlow (Estimasi Arus Dana Asing)',
      value: foreignFlow,
      decision: ffDecision,
      confidence: ffConfidence,
    });
  }

  const bandarmology = analyzeBandarmology(flowHistory.slice(-20));
  const flowPressure20 = officialUsable ? official.netPressure20 : bandarmology.cmf20;
  const flowPressureToday = officialUsable ? official.netPressureToday : bandarmology.netPressurePct;
  const flowStatus = officialUsable ? official.status : bandarmology.status;
  const bandarmologyDecision = flowStatus === 'BULLISH'
    ? 'BULLISH'
    : flowStatus === 'BEARISH'
      ? 'BEARISH'
      : 'NEUTRAL';
  const bandarmologyConfidence = flowPressure20 == null
    ? 0
    : Math.round(50 + Math.min(45, Math.abs(flowPressure20)));

  analyzersResult.push({
    dimension: 'FLOW',
    label: officialUsable ? 'Bandarmology (Net Asing)' : 'Bandarmology (CMF)',
    value: flowPressure20 == null || flowPressureToday == null
      ? (officialUsable
          ? 'N/A (transaksi asing nol pada jendela ini)'
          : 'N/A (histori OHLCV tidak cukup)')
      : officialUsable
        ? `Net asing 20D: ${flowPressure20 > 0 ? '+' : ''}${flowPressure20}% | Hari ini: ${flowPressureToday > 0 ? '+' : ''}${flowPressureToday}%`
        : `CMF20: ${flowPressure20 > 0 ? '+' : ''}${flowPressure20}% | Tekanan: ${flowPressureToday > 0 ? '+' : ''}${flowPressureToday}%`,
    decision: bandarmologyDecision,
    confidence: bandarmologyConfidence,
    raw: {
      cmf20: flowPressure20,
      netPressurePct: flowPressureToday,
      status: flowStatus,
      source: officialUsable ? 'IDX_OFFICIAL_API' : 'YAHOO_CMF_PROXY',
    },
  });

  return {
    flowPressure20,
    flowPressureToday,
    officialUsable,
    accumulationStatus: officialUsable ? official.accumulationStatus : accumulation.status,
    consecutiveBuyDays,
    consecutiveSellDays,
    mfmPositiveRatio20: officialUsable ? official.positiveRatio20 : accumulation.mfmPositiveRatio20,
  };
}
