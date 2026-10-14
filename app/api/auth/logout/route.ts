import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleLogout } from '@/modules/user';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { getAuthRequestMeta } from '@/shared/security/auth-request-meta';

export async function POST(req: NextRequest) {
  return runController(async () => {
    assertTrustedSameOrigin(req);
    return handleLogout(getAuthRequestMeta(req));
  }, req);
}
