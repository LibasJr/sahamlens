import { guard } from '@/lib/sahamLensGuard';
guard();

export const maxDuration = 60;

import { runController } from '@/shared/http/next-response.adapter';
import { handleRunBacktest } from '@/modules/backtest/controller/backtest.controller';
import { BACKTEST_PRESETS } from '@/modules/backtest/constants/presets';

// Desktop memakai daftar yang sama dengan halaman web agar komposisi strategi tidak
// pernah bercabang. Endpoint ini hanya mendeskripsikan preset, tidak menjalankan simulasi.
export async function GET(request: Request) {
  return runController(async () => ({ status: 200, body: { presets: BACKTEST_PRESETS } }), request);
}

export async function POST(request: Request) {
  return runController(() => handleRunBacktest(request), request);
}
