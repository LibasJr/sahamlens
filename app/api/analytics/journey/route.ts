import { runController } from '@/shared/http/next-response.adapter';
import { handleProductJourneyEvents } from '@/modules/user/controller/product-journey.controller';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return runController(() => handleProductJourneyEvents(request), request);
}
