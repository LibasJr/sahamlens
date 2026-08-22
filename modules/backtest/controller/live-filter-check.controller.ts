import type { HttpResult } from '@/shared/types/http-result.types';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { logger } from '@/shared/logger/logger';
import { readOrIssueAnonymousTrial, buildAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { scanLiveFilterCheck, type IndicatorName } from '@/modules/backtest';

const VALID_FILTERS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];

export async function handleLiveFilterCheck(request: Request): Promise<HttpResult> {
  try {
    const session = await getSession();
    let anonTrial: AnonTrialState | null = null;
    if (!session) anonTrial = await readOrIssueAnonymousTrial();

    if (!(await hasOpenOrProAccess(session))) {
      return { status: 402, body: { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' } };
    }

    const body = await request.json();
    const rawFilters: unknown[] = Array.isArray(body?.filters) ? body.filters : [];
    const hasUnknownFilter = rawFilters.some(
      (f): boolean => !(typeof f === 'string' && VALID_FILTERS.includes(f as IndicatorName)),
    );
    if (hasUnknownFilter) return { status: 400, body: { error: 'Filter tidak dikenal', code: 'VALIDATION_ERROR' } };
    const filters = rawFilters as IndicatorName[];
    if (filters.length === 0) return { status: 400, body: { error: 'Pilih minimal 1 filter', code: 'VALIDATION_ERROR' } };

    const result = await scanLiveFilterCheck(filters);
    const isGuest = !session || typeof session.id !== 'string';
    const visibleMatches = isGuest ? result.matches.slice(0, 1) : result.matches;
    const cookie = anonTrial ? await buildAnonymousTrialCookie(anonTrial) : null;

    return {
      status: 200,
      body: {
        scannedAt: result.scannedAt,
        filters: result.filters,
        matches: visibleMatches,
        total_matches: result.matches.length,
        locked_count: isGuest ? Math.max(0, result.matches.length - 1) : 0,
        is_guest_limited: isGuest,
        skippedCount: result.skipped.length,
        message: result.matches.length === 0
          ? 'Tidak ada saham di universe yang memenuhi kombinasi filter ini SEKARANG.'
          : undefined,
      },
      cookiesToSet: cookie ? [cookie] : undefined,
    };
  } catch (error) {
    logger.error('Live filter check gagal', { err: error });
    return { status: 500, body: { error: 'Server Error', code: 'INTERNAL_ERROR' } };
  }
}
