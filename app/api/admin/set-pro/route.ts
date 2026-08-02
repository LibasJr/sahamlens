import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { handleSetProStatus } from '@/modules/user';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return runController(async () => handleSetProStatus(cookies(), body));
}
