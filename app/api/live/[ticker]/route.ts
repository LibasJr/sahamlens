import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleGetLivePrice } from '@/modules/market/controller/live-price.controller';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  return runController(() => handleGetLivePrice(request, ticker), request);
}
