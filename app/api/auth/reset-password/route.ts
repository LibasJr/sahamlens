import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleResetPassword } from '@/modules/user';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

export async function POST(req: NextRequest) {
  return runController(async () => { assertTrustedSameOrigin(req); return handleResetPassword(await req.json()); }, req);
}
