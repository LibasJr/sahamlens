import { logger } from '@/shared/logger/logger';
import type { DecisionAgentSignal } from '@/modules/decision-agent';

const BOT_TOKEN = process.env.TELEGRAM_SIGNAL_BOT_TOKEN ?? '';
const CHAT_ID = process.env.TELEGRAM_SIGNAL_CHAT_ID ?? '';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

function formatPrice(n: number): string {
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
