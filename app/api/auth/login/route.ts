import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleLogin } from '@/modules/user';
import { getAuthRequestMeta } from '@/shared/security/auth-request-meta';

export async function POST(req: NextRequest) {
  return runController(async () => handleLogin(await req.json(), getAuthRequestMeta(req)), req);
}
