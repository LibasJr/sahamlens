import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleForgotPassword } from '@/modules/user';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { getTrustedClientIp } from '@/shared/http/client-ip';

export async function POST(req: NextRequest) {
  return runController(async () => {
    assertTrustedSameOrigin(req);
    return handleForgotPassword(await req.json(), getTrustedClientIp(req.headers));
  }, req);
}
