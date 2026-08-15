import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleVerify } from '@/modules/user';
import { getAuthRequestMeta } from '@/shared/security/auth-request-meta';

export async function POST(req: NextRequest) {
  return runController(async () => handleVerify(await req.json(), getAuthRequestMeta(req)), req);
}
