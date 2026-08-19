import { guard } from '@/lib/sahamLensGuard'; guard();
import { runController } from '@/shared/http/next-response.adapter';
import { handlePaymentNotify } from '@/modules/payment/controller/payment-notify.controller';

export async function POST(request: Request) {
  return runController(() => handlePaymentNotify(request), request);
}
