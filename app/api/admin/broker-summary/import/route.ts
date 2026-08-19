import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleBrokerSummaryImport } from '@/modules/broker-flow/controller/broker-summary-import.controller';

export const maxDuration = 300;

export async function POST(request: Request) {
  return runController(() => handleBrokerSummaryImport(request), request);
}
