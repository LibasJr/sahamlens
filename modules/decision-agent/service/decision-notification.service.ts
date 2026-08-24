import { sendTelegramMessage } from '@/lib/telegram';
import { logger } from '@/shared/logger/logger';
import { getDecisionSignalTransitions } from '../repository/decision-agent.repository';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function number(value: number, digits = 0): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value);
}

/**
 * Notifikasi deterministik dari record tersimpan. Tidak meminta LLM membuat narasi,
 * dan tidak mengirim alert untuk run pertama karena belum ada perubahan pembanding.
 */
export async function notifyDecisionSignalTransitions(runId: string): Promise<number> {
  const transitions = (await getDecisionSignalTransitions(runId)).filter(({ signal }) =>
    signal.paperReadiness === 'PAPER_READY'
    && signal.hybridStatus === 'CONFIRMED'
    && signal.hybridReview?.verdict === 'CONFIRM'
    && (signal.action === 'BUY_CANDIDATE' || signal.action === 'EXIT_REVIEW'),
  );
  let sent = 0;
  for (const { signal, previousAction } of transitions) {
    const risk = signal.riskSetup
      ? `\nEntry snapshot: ${number(signal.riskSetup.entry)} | Stop: ${number(signal.riskSetup.stop)} | Target 1: ${number(signal.riskSetup.target1)} | RR: ${number(signal.riskSetup.riskReward, 2)}`
      : '';
    const message = [
      '<b>SahamLens Internal Decision Alert</b>',
      `<b>${escapeHtml(signal.ticker)}</b>: ${previousAction} → ${signal.action}`,
      `LensScore: ${number(signal.lensScore, 1)} | Coverage: ${signal.coveragePct == null ? 'tidak tersedia' : `${number(signal.coveragePct, 1)}%`}${risk}`,
      `Data as-of: ${escapeHtml(signal.dataAsOf)}`,
      'Status: paper review only; bukan eksekusi broker.',
    ].join('\n');
    if (await sendTelegramMessage(message)) sent += 1;
    else logger.warn('Notifikasi decision agent tidak terkirim', { module: 'decision-agent', ticker: signal.ticker, runId });
  }
  return sent;
}
