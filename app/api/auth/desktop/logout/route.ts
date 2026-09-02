import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { handleLogout } from '@/modules/user';

/** Native clients use bearer credentials, so their tauri:// origin is not a browser CSRF signal. */
export async function POST() {
  return runController(async () => handleLogout());
}
