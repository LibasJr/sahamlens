import { runController } from '@/shared/http/next-response.adapter';
import { handleLogout } from '@/modules/user';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

export async function POST(req: Request) {
  return runController(async () => { assertTrustedSameOrigin(req); return handleLogout(); });
}
