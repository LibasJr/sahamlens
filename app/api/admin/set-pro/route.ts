import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { handleSetProStatus } from '@/modules/user';

export async function POST(request: Request) {
  return runController(async () => {
    assertTrustedSameOrigin(request);
    const body = await request.json().catch(() => ({}));
    return handleSetProStatus(await cookies(), body);
  });
}
