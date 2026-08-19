import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleLiveFilterCheck } from '@/modules/backtest/controller/live-filter-check.controller';

export const maxDuration = 60;

export async function POST(request: Request) {
  return runController(() => handleLiveFilterCheck(request), request);
}
