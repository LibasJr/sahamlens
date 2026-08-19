import { guard } from '@/lib/sahamLensGuard';
guard();

import type { NextRequest } from 'next/server';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { analyzeStock } from '@/modules/recommendation';
import { cacheGet, getCacheTtlRemaining } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { describeCacheAge } from '@/shared/http/freshness';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '@/shared/auth/anonymous-trial';
import { getLensScoreValidationStatus } from '@/modules/validation';
import { runController } from '@/shared/http/next-response.adapter';

// BUILD 006/007 - simbol yang rutin di-scan app/api/cron/recommendation-scan dibaca
// cache-first (per simbol); simbol lain di luar daftar itu tetap dihitung live.
function cacheKeyFor(symbol: string): string {
  return `sahamlens:cache:computed:recommendation:${symbol}`;
}

const MAX_SYMBOLS_PER_REQUEST = 20;

export async function GET(request: NextRequest) {
  let anonTrial: AnonTrialState | null = null;

  const response = await runController(async () => {
    const session = await getSession();

    // Cookie trial anonim tetap diterbitkan untuk telemetri pada respons sukses.
    if (!session) anonTrial = await readOrIssueAnonymousTrial();

    if (!(await hasOpenOrProAccess(session))) {
      return {
        status: 402,
        body: { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' },
      };
    }

    const symbolsParam = request.nextUrl.searchParams.get('symbols');
    const symbols = (symbolsParam ? symbolsParam.split(',') : ['BBCA.JK'])
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0 || symbols.length > MAX_SYMBOLS_PER_REQUEST) {
      return {
        status: 400,
        body: {
          error: `symbols harus berisi 1-${MAX_SYMBOLS_PER_REQUEST} ticker`,
          code: 'INVALID_SYMBOL_COUNT',
        },
      };
    }

    const results = [];
    const chunkSize = 5;
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (ticker) => {
          const cached = await cacheGet<any>(cacheKeyFor(ticker));
          if (cached) {
            const ttlRemaining = await getCacheTtlRemaining(cacheKeyFor(ticker));
            return { ...cached, _meta: describeCacheAge(ttlRemaining, CACHE_TTL_SEC.RECOMMENDATION_CRON) };
          }
          const fresh = await analyzeStock(ticker);
          return fresh
            ? {
                ...fresh,
                _meta: {
                  freshness: 'FRESH',
                  cachedAgeSec: 0,
                  cacheTtlSec: CACHE_TTL_SEC.RECOMMENDATION_CRON,
                },
              }
            : fresh;
        }),
      );
      results.push(...chunkResults.filter(Boolean));
    }

    return {
      status: 200,
      body: {
        recommendations: results,
        dataTimestamp: results
          .map((result: any) => result?.dataTimestamp)
          .filter((timestamp): timestamp is string => typeof timestamp === 'string')
          .sort()
          .at(-1) ?? null,
        modelValidation: getLensScoreValidationStatus(),
      },
    };
  }, request);

  // Perilaku lama: cookie trial anonim hanya ditempel pada response sukses.
  if (anonTrial && response.ok) await applyAnonymousTrialCookie(response, anonTrial);
  return response;
}
