import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleLensScoreBucketBacktest } from '@/modules/recommendation/controller/lens-score-bucket-backtest.controller';

export async function GET(request: Request) {
  return runController(() => handleLensScoreBucketBacktest(request), request);
}
