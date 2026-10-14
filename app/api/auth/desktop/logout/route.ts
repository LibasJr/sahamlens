import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleLogout } from '@/modules/user';
import { getAuthRequestMeta } from '@/shared/security/auth-request-meta';

/** Native clients use bearer credentials, so their tauri:// origin is not a browser CSRF signal. */
export async function POST(req: NextRequest) {
  return runController(async () => handleLogout(getAuthRequestMeta(req)), req);
}
