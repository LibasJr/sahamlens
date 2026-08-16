import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleListTransactions, handleCreateTransaction } from '@/modules/portfolio';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

export async function GET(req: NextRequest) {
  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  return runController(async () => handleListTransactions(query), req);
}

export async function POST(req: NextRequest) {
  return runController(async () => { assertTrustedSameOrigin(req); return handleCreateTransaction(await req.json()); }, req);
}
