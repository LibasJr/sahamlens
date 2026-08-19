import { runController } from '@/shared/http/next-response.adapter';
import { handleProductFunnelEvent } from '@/modules/user/controller/product-funnel.controller';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return runController(() => handleProductFunnelEvent(request), request);
}
