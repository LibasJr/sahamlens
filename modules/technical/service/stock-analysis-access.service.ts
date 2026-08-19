import { getTrustedClientIp } from '@/shared/http/client-ip';
import type { HttpResult } from '@/shared/types/http-result.types';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { isInternalServiceRequest } from '@/shared/auth/internal-service';
import { recordAnalisaHit } from '@/lib/serverStats';
import { FREE_LIMITS } from '@/shared/constants/limits';
import {
  getUsedSymbolsToday,
  peekDailyAnalisaUsed,
  recordDailyAnalisa,
} from '@/shared/usage/daily-analisa-quota';

export interface StockAnalysisAccessContext {
  ticker: string;
  isInternal: boolean;
  session: Awaited<ReturnType<typeof getSession>>;
  hasPro: boolean;
}

export type StockAnalysisAccessResolution =
  | { ok: true; context: StockAnalysisAccessContext }
  | { ok: false; response: HttpResult };

/**
 * Resolves ticker validation, session entitlement and daily free quota in one place.
 * Guest access remains intentionally open; registered non-Pro users keep the existing
 * daily analysis quota contract.
 */
export async function resolveStockAnalysisAccess(
  request: Request,
  rawTicker: string,
): Promise<StockAnalysisAccessResolution> {
  const ticker = normalizeIdxTickerParam(rawTicker, { allowMarketIndex: true });
  if (!ticker) {
    return { ok: false, response: { status: 400, body: { error: 'Ticker tidak valid' } } };
  }

  const isInternal = isInternalServiceRequest(request);
  const session = isInternal ? null : await getSession();
  const hasPro = isInternal || (await hasOpenOrProAccess(session));

  if (!hasPro) {
    // This branch can only be reached by a registered user whose open/trial access
    // has ended, therefore session is guaranteed by hasOpenOrProAccess semantics.
    const userId = session?.id;
    if (!userId) {
      return { ok: false, response: { status: 401, body: { error: 'Sesi tidak valid' } } };
    }

    const used = await peekDailyAnalisaUsed(userId);
    if (used >= FREE_LIMITS.analisaPerHari) {
      const usedSymbols = await getUsedSymbolsToday(userId);
      return {
        ok: false,
        response: {
          status: 402,
          body: {
            error: 'Fitur ini butuh akun Pro',
            code: 'SUBSCRIPTION_REQUIRED',
            usedToday: used,
            limit: FREE_LIMITS.analisaPerHari,
            usedSymbols,
          },
        },
      };
    }
  }

  if (!isInternal) {
    recordAnalisaHit(getTrustedClientIp(request.headers), ticker);
  }

  return { ok: true, context: { ticker, isInternal, session, hasPro } };
}

/**
 * Quota metadata is attached after cache/computation so shared technical cache entries
 * never contain user-specific usage state.
 */
export async function attachStockAnalysisQuota(
  payload: any,
  context: StockAnalysisAccessContext,
) {
  const userId = context.session?.id;
  if (context.hasPro || context.isInternal || !userId) return payload;

  await recordDailyAnalisa(userId, context.ticker);
  const used = await peekDailyAnalisaUsed(userId);
  const usedSymbols = await getUsedSymbolsToday(userId);

  return {
    ...payload,
    _quota: {
      used,
      limit: FREE_LIMITS.analisaPerHari,
      remaining: Math.max(0, FREE_LIMITS.analisaPerHari - used),
      usedSymbols,
    },
  };
}
