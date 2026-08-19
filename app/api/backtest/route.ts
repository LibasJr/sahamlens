import { guard } from '@/lib/sahamLensGuard';
guard();

export const maxDuration = 60;

import { runController } from '@/shared/http/next-response.adapter';
import { handleRunBacktest } from '@/modules/backtest/controller/backtest.controller';

export async function POST(request: Request) {
  return runController(() => handleRunBacktest(request), request);
}
