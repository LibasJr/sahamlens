import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getIntradayDashboard } from '@/modules/intraday';

// Ringkasan saja - seluruh kerja berat ada di POST /actions dan cron collector,
// jadi membuka halaman admin tidak pernah memicu backtest puluhan ribu baris.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET() {
  return runController(async () => {
    if (!(await isAdminFromRequestCookies(await cookies()))) throw new ForbiddenError();
    const data = await getIntradayDashboard();
    return { status: 200, body: data };
  });
}
