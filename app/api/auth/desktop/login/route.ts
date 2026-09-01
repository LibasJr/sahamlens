import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleDesktopLogin } from '@/modules/user';
import { getAuthRequestMeta } from '@/shared/security/auth-request-meta';

export async function POST(req: NextRequest) {
  return runController(async () => {
    // Tauri sends its internal application origin (for example tauri://localhost),
    // which is deliberately not a trusted browser origin. This route issues no
    // cookie and returns a bearer token only to the native HTTP client, so browser
    // CSRF protection is neither applicable nor a valid desktop trust signal.
    return handleDesktopLogin(await req.json(), getAuthRequestMeta(req));
  }, req);
}
