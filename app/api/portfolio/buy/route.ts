import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleBuy } from '@/modules/portfolio';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

export async function POST(req: NextRequest) {
  return runController(async () => { assertTrustedSameOrigin(req); return handleBuy(await req.json()); }, req);
}
