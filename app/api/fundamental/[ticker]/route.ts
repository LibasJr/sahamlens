import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleGetFundamental } from '@/modules/fundamental/controller/fundamental.controller';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  return runController(() => handleGetFundamental(request, ticker), request);
}
