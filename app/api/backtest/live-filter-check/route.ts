import { guard } from '../../../../lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { SubscriptionRequiredError } from '@/shared/errors/app-error';
import { z } from 'zod';
import { getSession, hasOpenOrProAccess } from '../../../../modules/user';
import { logger } from '../../../../shared/logger/logger';
import { readOrIssueAnonymousTrial, buildAnonymousTrialCookie, type AnonTrialState } from '../../../../shared/auth/anonymous-trial';
import { scanLiveFilterCheck, type IndicatorName } from '../../../../modules/backtest';

// "Live Filter Check" - endpoint TERPISAH dari /api/backtest (bukan mode di dalamnya,
// beda arsitektur: fetch live ke Yahoo per request, bukan baca cache precompute harian)
// supaya jelas dua hal berbeda: /api/backtest = simulasi historis dari data yang SUDAH
// dihitung; endpoint ini = pengecekan LIVE saat dipanggil. Auth/gate sama persis dengan
// /api/backtest (trial anonim 7 hari ATAU Pro) - satu fitur keluarga yang sama.
export const maxDuration = 60;

const VALID_FILTERS: IndicatorName[] = [
  'EMA 20/50 Cross', 'Volume vs Avg 20D', 'RSI 14', 'MACD', 'Volatility (ATR 14)',
  'MA Trend IDX (20,50,200)', 'Support & Resistance', 'Market Flow Index', 'SMA Score (5,10,20)',
];

export async function POST(request: Request) {
  return runController(async () => {
    const session = await getSession();
    // Cookie trial anonim tetap diterbitkan (telemetri), tapi tidak lagi menggerbang
    // akses - lihat hasOpenOrProAccess() untuk alasannya.
    let anonTrial: AnonTrialState | null = null;
    if (!session) anonTrial = await readOrIssueAnonymousTrial();

    if (!(await hasOpenOrProAccess(session))) {
      throw new SubscriptionRequiredError();
    }

    // Tiga pemeriksaan tangan (array?, tiap elemen dikenal?, minimal satu?) menjadi satu
    // skema. Kedua pesan errornya dipertahankan persis supaya UI yang menampilkannya tidak
    // berubah, dan daftar filter yang sah tetap bersumber dari VALID_FILTERS - bukan
    // disalin ulang sebagai literal di dalam skema.
    const bodySchema = z.object({
      filters: z
        .array(z.enum(VALID_FILTERS as unknown as [IndicatorName, ...IndicatorName[]], {
          message: 'Filter tidak dikenal',
        }))
        .min(1, 'Pilih minimal 1 filter'),
    });
    const { filters } = parseOrThrow(bodySchema, await request.json());

    const result = await scanLiveFilterCheck(filters);

    const isGuest = !session || typeof session.id !== 'string';
    const visibleMatches = isGuest ? result.matches.slice(0, 1) : result.matches;
    const lockedCount = isGuest ? Math.max(0, result.matches.length - 1) : 0;

    const responseBody = {
      scannedAt: result.scannedAt,
      filters: result.filters,
      matches: visibleMatches,
      total_matches: result.matches.length,
      locked_count: lockedCount,
      is_guest_limited: isGuest,
      skippedCount: result.skipped.length,
      message: result.matches.length === 0
        ? 'Tidak ada saham di universe yang memenuhi kombinasi filter ini SEKARANG.'
        : undefined,
    };

    const trialCookie = anonTrial ? await buildAnonymousTrialCookie(anonTrial) : null;
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
    return {
      status: 200,
      body: responseBody,
      ...(trialCookie ? { cookiesToSet: [trialCookie] } : {}),
    };
  });
}
