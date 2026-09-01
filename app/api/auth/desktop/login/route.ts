import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleDesktopLogin } from '@/modules/user';
import { getAuthRequestMeta } from '@/shared/security/auth-request-meta';

export async function POST(req: NextRequest) {
  return runController(async () => {
    // Native clients authenticate with a bearer token rather than a browser cookie,
    // so their internal Tauri origin is not a browser CSRF trust signal.
    return handleDesktopLogin(await req.json(), getAuthRequestMeta(req));
  }, req);
}