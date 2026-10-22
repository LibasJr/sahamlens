import { logger } from '@/shared/logger/logger';
import type { DecisionAgentSignal } from '@/modules/decision-agent';
import type { TradingViewStockItem, IdxMarketScanResult } from '@/modules/market-data';

const BOT_TOKEN = process.env.TELEGRAM_SIGNAL_BOT_TOKEN ?? '';
const CHAT_ID = process.env.TELEGRAM_SIGNAL_CHAT_ID ?? '';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export function formatPrice(n: number): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

function pctChange(from: number, to: number): string {
  const pct = ((to - from) / from) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function actionEmoji(action: string): string {
  switch (action) {
    case 'BUY_CANDIDATE': return '🟢';
    case 'WATCH': return '👀';
    case 'HOLD': return '🔵';
    case 'EXIT_REVIEW': return '🔴';
    default: return '⚪';
  }
}

function confidenceBar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

export function formatSignalMessage(signal: DecisionAgentSignal): string {
  const lines: string[] = [];

  lines.push(`${actionEmoji(signal.action)} *${signal.action.replace('_', ' ')}*: \`${signal.ticker}\``);
  lines.push('');
  lines.push(`💰 Harga: Rp ${formatPrice(signal.price)}`);
  lines.push(`📊 LensScore: ${signal.lensScore} ${confidenceBar(signal.lensScore)}`);

  if (signal.scoreBreakdown) {
    const { technical, fundamental, flow } = signal.scoreBreakdown;
    lines.push(`   Tech: ${technical} | Fund: ${fundamental} | Flow: ${flow}`);
  }

  if (signal.sector) {
    lines.push(`🏢 Sektor: ${signal.sector}`);
  }

  if (signal.riskSetup) {
    const rs = signal.riskSetup;
    lines.push('');
    lines.push('🛡️ *Risk Setup*');
    lines.push(`   Entry: Rp ${formatPrice(rs.entry)}`);
    lines.push(`   Stop Loss: Rp ${formatPrice(rs.stop)} (${pctChange(rs.entry, rs.stop)})`);
    lines.push(`   TP1: Rp ${formatPrice(rs.target1)} (${pctChange(rs.entry, rs.target1)})`);
    lines.push(`   TP2: Rp ${formatPrice(rs.target2)} (${pctChange(rs.entry, rs.target2)})`);
    lines.push(`   ⚖️ R:R = 1:${rs.riskReward.toFixed(1)}`);
  }

  if (signal.news.positive + signal.news.negative > 0) {
    lines.push('');
    lines.push(`📰 Berita: +${signal.news.positive} / -${signal.news.negative}`);
    if (signal.news.matchedHeadlines.length > 0) {
      lines.push(`   "${signal.news.matchedHeadlines[0]}"`);
    }
  }

  if (signal.supportingReasons.length > 0) {
    lines.push('');
    lines.push('✅ *Alasan*');
    for (const r of signal.supportingReasons.slice(0, 3)) {
      lines.push(`   • ${r}`);
    }
  }

  if (signal.opposingReasons.length > 0) {
    lines.push('');
    lines.push('⚠️ *Perhatian*');
    for (const r of signal.opposingReasons.slice(0, 2)) {
      lines.push(`   • ${r}`);
    }
  }

  if (signal.hybridReview?.verdict) {
    const v = signal.hybridReview.verdict;
    const icon = v === 'CONFIRM' ? '✅' : v === 'CHALLENGE' ? '❌' : '❓';
    lines.push('');
    lines.push(`🤖 AI Review: ${icon} ${v} (${signal.hybridReview.confidence})`);
  }

  lines.push('');
  lines.push(`📅 Data: ${signal.dataAsOf}`);
  lines.push(`🏷️ ${signal.version}`);

  return lines.join('\n');
}

export function formatDailySummary(
  signals: DecisionAgentSignal[],
  dataAsOf: string,
): string {
  const buys = signals.filter((s) => s.action === 'BUY_CANDIDATE');
  const watches = signals.filter((s) => s.action === 'WATCH');
  const exits = signals.filter((s) => s.action === 'EXIT_REVIEW');

  const lines: string[] = [];
  lines.push('📡 *SIGNAL SAHAMLENS*');
  lines.push(`📅 ${dataAsOf}`);
  lines.push('');
  lines.push(`🟢 Buy Candidate: ${buys.length}`);
  lines.push(`👀 Watch: ${watches.length}`);
  lines.push(`🔴 Exit Review: ${exits.length}`);
  lines.push(`📊 Total dianalisis: ${signals.length}`);

  if (buys.length > 0) {
    lines.push('');
    lines.push('*Top Sinyal:*');
    for (const s of buys.slice(0, 5)) {
      const rr = s.riskSetup ? ` | R:R 1:${s.riskSetup.riskReward.toFixed(1)}` : '';
      lines.push(`  🟢 \`${s.ticker}\` Rp ${formatPrice(s.price)} | LS ${s.lensScore}${rr}`);
    }
  }

  if (watches.length > 0) {
    lines.push('');
    for (const s of watches.slice(0, 3)) {
      lines.push(`  👀 \`${s.ticker}\` Rp ${formatPrice(s.price)} | LS ${s.lensScore}`);
    }
  }

  lines.push('');
  lines.push('_Bukan rekomendasi investasi. DYOR._');

  return lines.join('\n');
}

export async function sendTelegramMessage(
  text: string,
  chatId: string = CHAT_ID,
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'TELEGRAM_SIGNAL_BOT_TOKEN not configured' };
  if (!chatId) return { ok: false, error: 'TELEGRAM_SIGNAL_CHAT_ID not configured' };

  try {
    const resp = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    const data = await resp.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!data.ok) {
      logger.error('[telegram-signal] send failed', { err: data.description, chatId });
      return { ok: false, error: data.description };
    }
    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('[telegram-signal] network error', { err: msg });
    return { ok: false, error: msg };
  }
}

export async function sendSignalBatch(
  signals: DecisionAgentSignal[],
  dataAsOf: string,
  chatId?: string,
): Promise<{ sent: number; failed: number }> {
  const target = chatId || CHAT_ID;
  let sent = 0;
  let failed = 0;

  // 1. Kirim ringkasan harian
  const summary = formatDailySummary(signals, dataAsOf);
  const summaryResult = await sendTelegramMessage(summary, target);
  if (summaryResult.ok) sent++;
  else failed++;

  // 2. Kirim detail setiap BUY_CANDIDATE
  const buys = signals.filter((s) => s.action === 'BUY_CANDIDATE' && s.riskSetup);
  for (const signal of buys) {
    // Rate limit: 1 msg/sec per chat
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const msg = formatSignalMessage(signal);
    const result = await sendTelegramMessage(msg, target);
    if (result.ok) sent++;
    else failed++;
  }

  return { sent, failed };
}

export interface SwingRiskSetup {
  entryPrice: number;
  entryRangeMin: number;
  entryRangeMax: number;
  stopLossPrice: number;
  stopLossPct: number;
  target1Price: number;
  target1Pct: number;
  target1RiskReward: number;
  target2Price: number;
  target2Pct: number;
  target2RiskReward: number;
  riskPerShare: number;
  riskPerLot: number;
  assumedPortfolio: number;
  riskPerTradePct: number;
  maxRiskAmount: number;
  maxPositionShares: number;
  maxPositionLots: number;
  recommendedPositionShares: number;
  recommendedPositionLots: number;
  recommendedCapitalAllocation: number;
  recommendedAllocationPct: number;
  verdict: 'VALID SWING ENTRY' | 'WATCH ONLY' | 'HINDARI';
  actionStatus: 'Beli bertahap' | 'Jual sebagian' | 'Batas batal (Stop Loss)' | 'Hindari';
}

export function calculateSwingRiskSetup(
  stock: Pick<TradingViewStockItem, 'close' | 'ema20' | 'low' | 'atr' | 'rsScore'>,
  portfolioSize: number = 100_000_000
): SwingRiskSetup | null {
  const entryPrice = stock.close;
  if (entryPrice === null || entryPrice <= 0) return null;

  const entryRangeMin = Math.round(entryPrice * 0.99);
  const entryRangeMax = Math.round(entryPrice * 1.01);

  // Cari level stop loss teknikal terukur (3.5% - 6.0%)
  const minStop = Math.round(entryPrice * 0.94); // Stop maksimal -6.0%
  const maxStop = Math.round(entryPrice * 0.965); // Stop minimal -3.5%
  let stopLossPrice = Math.round(entryPrice * 0.955); // Default ~ -4.5%

  if (stock.low !== null && stock.low < entryPrice) {
    if (stock.low <= minStop) {
      stopLossPrice = minStop;
    } else if (stock.low <= maxStop) {
      stopLossPrice = stock.low;
    } else {
      stopLossPrice = maxStop;
    }
  } else if (stock.ema20 !== null && stock.ema20 < entryPrice) {
    const belowEma20 = Math.round(stock.ema20 * 0.98);
    if (belowEma20 <= minStop) {
      stopLossPrice = minStop;
    } else if (belowEma20 <= maxStop) {
      stopLossPrice = belowEma20;
    } else {
      stopLossPrice = maxStop;
    }
  }

  // Jaga batasan ketat stop loss antara minStop dan maxStop
  stopLossPrice = Math.max(minStop, Math.min(maxStop, stopLossPrice));

  const riskPerShare = entryPrice - stopLossPrice;
  const stopLossPct = Math.round(((entryPrice - stopLossPrice) / entryPrice) * 10000) / 100;

  // Target Profit sesuai prinsip Libas (RR min 1:1.8 - 1:2.0)
  const target1RiskReward = 2.0;
  const target1Price = Math.round(entryPrice + target1RiskReward * riskPerShare);
  const target1Pct = Math.round(((target1Price - entryPrice) / entryPrice) * 10000) / 100;

  const target2RiskReward = 3.5;
  const target2Price = Math.round(entryPrice + target2RiskReward * riskPerShare);
  const target2Pct = Math.round(((target2Price - entryPrice) / entryPrice) * 10000) / 100;

  const riskPerLot = riskPerShare * 100;
  const riskPerTradePct = 2.5; // Toleransi risiko 2.5% modal portofolio
  const maxRiskAmount = Math.round(portfolioSize * (riskPerTradePct / 100));

  const maxPositionShares = riskPerShare > 0 ? Math.floor(maxRiskAmount / riskPerShare) : 0;
  const maxPositionLots = Math.floor(maxPositionShares / 100);

  // Alokasi modal maksimal 15% modal portofolio (Aturan Libas)
  const maxAllocationCapital = portfolioSize * 0.15;
  const maxLotsByAllocation = Math.floor(maxAllocationCapital / (entryPrice * 100));

  const recommendedPositionLots = Math.max(1, Math.min(maxPositionLots, maxLotsByAllocation));
  const recommendedPositionShares = recommendedPositionLots * 100;
  const recommendedCapitalAllocation = recommendedPositionShares * entryPrice;
  const recommendedAllocationPct =
    Math.round((recommendedCapitalAllocation / portfolioSize) * 10000) / 100;

  const isRsQualified = (stock.rsScore ?? 0) >= 70;
  const isRrQualified = target1RiskReward >= 1.8 && stopLossPct <= 6.0;

  const verdict: 'VALID SWING ENTRY' | 'WATCH ONLY' | 'HINDARI' =
    isRrQualified && isRsQualified
      ? 'VALID SWING ENTRY'
      : isRrQualified
        ? 'WATCH ONLY'
        : 'HINDARI';

  const actionStatus: 'Beli bertahap' | 'Jual sebagian' | 'Batas batal (Stop Loss)' | 'Hindari' =
    verdict === 'VALID SWING ENTRY'
      ? 'Beli bertahap'
      : verdict === 'WATCH ONLY'
        ? 'Beli bertahap'
        : 'Hindari';

  return {
    entryPrice,
    entryRangeMin,
    entryRangeMax,
    stopLossPrice,
    stopLossPct,
    target1Price,
    target1Pct,
    target1RiskReward,
    target2Price,
    target2Pct,
    target2RiskReward,
    riskPerShare,
    riskPerLot,
    assumedPortfolio: portfolioSize,
    riskPerTradePct,
    maxRiskAmount,
    maxPositionShares,
    maxPositionLots,
    recommendedPositionShares,
    recommendedPositionLots,
    recommendedCapitalAllocation,
    recommendedAllocationPct,
    verdict,
    actionStatus,
  };
}

export function formatSwingMomentumAlert(
  stock: TradingViewStockItem,
  portfolioSize: number = 100_000_000
): string {
  const risk = calculateSwingRiskSetup(stock, portfolioSize);
  const ticker = stock.ticker;
  const sector = stock.sector || 'Umum';
  const industry = stock.industry || 'Umum';
  const turnoverM = stock.turnover ? (stock.turnover / 1e9).toFixed(1) : '0.0';
  const rsScore = stock.rsScore !== null ? `${stock.rsScore}` : '-';
  const changePct =
    stock.change !== null
      ? stock.change >= 0
        ? `+${stock.change.toFixed(2)}%`
        : `${stock.change.toFixed(2)}%`
      : '-';

  let setupTitle = 'Stage 2 Swing Momentum Setup';
  let vsaEvidence = 'Struktur harga di atas SMA50 & SMA200';

  if (stock.isBlueSkyRs) {
    setupTitle = 'Blue Sky RS Leading Divergence + Stage 2';
    vsaEvidence = 'RS Line rekor tertinggi baru saat IHSG konsolidasi/tertekan';
  } else if (stock.isPocketPivot) {
    setupTitle = 'Pocket Pivot Breakout + High RS';
    vsaEvidence = `Volume spike RVOL ${stock.rvol?.toFixed(2) ?? '-'}x memantul dari moving average`;
  } else if (stock.isShakeoutSpring) {
    setupTitle = 'Shakeout Spring Reversal Trap';
    vsaEvidence = `Intraday sweep bawah support lalu ditutup kuat (UCR ${(stock.ucr ?? 0).toFixed(2)})`;
  } else if (stock.isVolumeAbsorption) {
    setupTitle = 'Smart Money Volume Absorption / Stopping Volume';
    vsaEvidence = `Spread sempit (${stock.spreadRatio?.toFixed(2) ?? '-'} ATR) dengan serapan volume tinggi`;
  } else if (stock.near52wHigh) {
    setupTitle = 'Stage 2 Near 52-Week High Breakout';
    vsaEvidence = `Jarak dari 52W High hanya ${stock.dist52wHighPct?.toFixed(1) ?? '-'}%`;
  }

  let rsStatus = 'Menyamai IHSG';
  if (stock.isLeadingVsIhsg) {
    rsStatus = `OUTPERFORM IHSG (Alpha 3M: +${(stock.alphaVsIhsg3M ?? 0).toFixed(1)}%)`;
  } else if (stock.isBlueSkyRs) {
    rsStatus = 'BLUE SKY LEADING DIVERGENCE (Top Outperformer)';
  }

  const lines: string[] = [];
  lines.push(`🚨 [SWING MOMENTUM ALERT] #${ticker} (${sector})`);
  lines.push('━'.repeat(29));
  lines.push(`📊 SETUP: ${setupTitle}`);
  lines.push(`🏢 Sektor: ${sector} | Industri: ${industry}`);
  lines.push(`⚡ Likuiditas: Rp ${turnoverM} M | RS Rank: ${rsScore}/99`);
  lines.push(`📈 RS Line vs IHSG: ${rsStatus}`);
  lines.push('');

  if (risk) {
    const statusNote =
      risk.actionStatus === 'Beli bertahap'
        ? '🟢 Beli bertahap (On Breakout Confirmation)'
        : risk.actionStatus === 'Hindari'
          ? '⚪ Hindari (Kriteria RS/Risiko Kurang Memadai)'
          : risk.actionStatus === 'Jual sebagian'
            ? '🟡 Jual sebagian (Take Profit Terukur)'
            : '🔴 Batas batal (Stop Loss Disiplin)';

    lines.push('🎯 STRATEGI & LEVEL EKSEKUSI:');
    lines.push(`• Status: ${statusNote}`);
    lines.push(
      `• Area Beli: ${formatPrice(risk.entryRangeMin)} – ${formatPrice(risk.entryRangeMax)} (Last: ${formatPrice(risk.entryPrice)} | ${changePct})`
    );
    lines.push(`• Batas Batal (Stop Loss): ${formatPrice(risk.stopLossPrice)} (-${risk.stopLossPct}%)`);
    lines.push(
      `• Sasaran 1 (TP1): ${formatPrice(risk.target1Price)} (+${risk.target1Pct}% | RR 1 : ${risk.target1RiskReward}) -> Jual sebagian`
    );
    lines.push(
      `• Sasaran 2 (TP2): ${formatPrice(risk.target2Price)} (+${risk.target2Pct}% | RR 1 : ${risk.target2RiskReward}) -> Trail Stop Loss`
    );
    lines.push('');
    lines.push(`🛡️ MANAJEMEN RISIKO (Risk per Trade ${risk.riskPerTradePct}%):`);
    lines.push(`• Modal Portofolio Asumsi: Rp ${formatPrice(risk.assumedPortfolio)}`);
    lines.push(`• Maksimum Toleransi Risiko: Rp ${formatPrice(risk.maxRiskAmount)}`);
    lines.push(`• Risiko per Lembar: Rp ${formatPrice(risk.riskPerShare)} (Rp ${formatPrice(risk.riskPerLot)}/lot)`);
    lines.push(
      `• Saran Alokasi Libas (Maks 15%): ${risk.recommendedPositionLots} Lot (~Rp ${formatPrice(risk.recommendedCapitalAllocation)} / ${risk.recommendedAllocationPct}% modal)`
    );
  }

  lines.push('');
  lines.push('🔍 BUKTI SMART MONEY (Microstructure):');
  lines.push(`• Relative Volume (RVOL): ${stock.rvol !== null ? `${stock.rvol.toFixed(2)}x` : '-'}`);
  lines.push(
    `• Upper Close Ratio (UCR): ${stock.ucr !== null ? stock.ucr.toFixed(2) : '-'} (Tutup rentang atas)`
  );
  lines.push(`• Microstructure Footprint: ${vsaEvidence}`);
  lines.push('');

  if (risk) {
    lines.push(`⚖️ VERDIK: ${risk.verdict} (RR 1:${risk.target1RiskReward}, Risiko ${risk.stopLossPct}%)`);
  }
  lines.push('━'.repeat(29));

  return lines.join('\n');
}

export function formatSwingScannerBatchSummary(result: IdxMarketScanResult): string {
  const mb = result.marketBreadth;
  const ih = result.ihsg;

  const ihClose = ih && ih.close !== null ? ih.close.toLocaleString('id-ID') : '-';
  const ihChg =
    ih && ih.change !== null
      ? ih.change >= 0
        ? `+${ih.change.toFixed(2)}%`
        : `${ih.change.toFixed(2)}%`
      : '-';
  const ihTrend = ih?.trend ?? 'NEUTRAL';

  const lines: string[] = [];
  lines.push('📡 [IDX MARKET SCANNER RECAP]');
  lines.push('━'.repeat(29));
  lines.push(`📅 ${result.timestamp}`);
  lines.push(`🏛️ IHSG Benchmark: ${ihClose} (${ihChg}) | Trend: ${ihTrend}`);
  lines.push(
    `📊 Market Breadth: Naik ${mb.advances} | Turun ${mb.declines} | A/D ${mb.advanceDeclineRatio}x (${mb.sentiment})`
  );
  lines.push(`💰 Total Turnover: Rp ${mb.totalTurnoverTrillion} Triliun`);
  lines.push('');
  lines.push('🔥 SETUP UNGGULAN:');
  lines.push(`• Blue Sky RS Leaders   : ${result.blueSkyRsStocks.length} emiten`);
  lines.push(`• Pocket Pivot Breakout  : ${result.pocketPivotStocks.length} emiten`);
  lines.push(`• Smart Money Absorption : ${result.volumeAbsorptionStocks.length} emiten`);
  lines.push(`• Shakeout Spring Traps  : ${result.shakeoutSpringStocks.length} emiten`);
  lines.push(`• Stage 2 Near 52W High  : ${result.near52wStocks.length} emiten`);
  lines.push('');

  const candidates = [
    ...result.blueSkyRsStocks.slice(0, 3),
    ...result.shakeoutSpringStocks.slice(0, 2),
    ...result.pocketPivotStocks.slice(0, 2),
  ];

  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((c) => {
    if (seen.has(c.ticker)) return false;
    seen.add(c.ticker);
    return true;
  });

  if (uniqueCandidates.length > 0) {
    lines.push('🎯 TOP CANDIDATES TO WATCH:');
    for (const s of uniqueCandidates.slice(0, 5)) {
      const chg =
        s.change !== null
          ? s.change >= 0
            ? `+${s.change.toFixed(1)}%`
            : `${s.change.toFixed(1)}%`
          : '-';
      const toM = s.turnover ? (s.turnover / 1e9).toFixed(1) : '-';
      const rs = s.rsScore ?? '-';
      lines.push(`  • #${s.ticker} (${s.close}) [${chg}] | RS ${rs} | Vol Rp ${toM} M`);
    }
  }

  lines.push('━'.repeat(29));
  return lines.join('\n');
}
