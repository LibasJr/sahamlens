import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleUpdateJournal } from '@/modules/watchlist';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

export async function PUT(req: NextRequest) {
  return runController(async () => { assertTrustedSameOrigin(req); return handleUpdateJournal(await req.json()); }, req);
}
