import { guard } from '../../../../lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccessLive } from '../../../../modules/user';
import { logger } from '../../../../shared/logger/logger';
import { readOrIssueAnonymousTrial, applyAnonymousTrialCookie, type AnonTrialState } from '../../../../shared/auth/anonymous-trial';
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
  try {
    const session = await getSession();
    let anonTrial: AnonTrialState | null = null;
    if (!session) {
      anonTrial = await readOrIssueAnonymousTrial();
      if (!anonTrial.active) {
        return NextResponse.json({ error: 'Belum login' }, { status: 401 });
      }
    }

    const hasPro = anonTrial?.active === true || (await checkProAccessLive(session));
    if (!hasPro) {
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const body = await request.json();
    const rawFilters: unknown[] = Array.isArray(body?.filters) ? body.filters : [];
    const hasUnknownFilter = rawFilters.some(
      (f): boolean => !(typeof f === 'string' && VALID_FILTERS.includes(f as IndicatorName))
    );
    if (hasUnknownFilter) {
      return NextResponse.json({ error: 'Filter tidak dikenal' }, { status: 400 });
    }
    const filters = rawFilters as IndicatorName[];
    if (filters.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal 1 filter' }, { status: 400 });
    }

    const result = await scanLiveFilterCheck(filters);

    const responseBody = {
      scannedAt: result.scannedAt,
      filters: result.filters,
      matches: result.matches,
      skippedCount: result.skipped.length,
      message: result.matches.length === 0
        ? 'Tidak ada saham di universe yang memenuhi kombinasi filter ini SEKARANG.'
        : undefined,
    };

    const response = NextResponse.json(responseBody);
    if (anonTrial) await applyAnonymousTrialCookie(response, anonTrial);
    return response;
  } catch (error) {
    logger.error('Live filter check gagal', { error });
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
