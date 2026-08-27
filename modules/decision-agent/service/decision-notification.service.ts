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
    ['BUY_CANDIDATE', 'HOLD', 'EXIT_REVIEW'].includes(signal.action),
  );
  if (transitions.length === 0) return 0;
  const lines = transitions.slice(0, 20).map(({ signal, previousAction }) => {
    // Kesiapan paper sudah tidak digerbangi hybridStatus (2026-08-27) - lihat catatan
    // di paper-execution.service.ts. Status hybrid tetap ditampilkan sebagai info, bukan blocker.
    const executable = signal.paperReadiness === 'PAPER_READY';
    const blocker = executable ? 'siap ditinjau admin' : signal.invalidationReasons[0] || signal.opposingReasons[0] || 'belum PAPER_READY';
    return `<b>${escapeHtml(signal.ticker)}</b> ${previousAction} → ${signal.action} | score ${number(signal.lensScore, 1)} | ${escapeHtml(blocker)} | hybrid ${escapeHtml(signal.hybridStatus)}`;
  });
  const latest = transitions[0]!.signal;
  const message = [
    '<b>SahamLens Internal Decision Update</b>',
    ...lines,
    `Data as-of: ${escapeHtml(latest.dataAsOf)} | ${latest.stale ? 'STALE' : 'FRESH'}`,
    'Tidak ada order otomatis. Paper order tetap memerlukan persetujuan admin; live broker terkunci.',
  ].join('\n');
  if (await sendTelegramMessage(message)) return 1;
  logger.warn('Notifikasi decision agent tidak terkirim', { module: 'decision-agent', runId });
  return 0;
}
