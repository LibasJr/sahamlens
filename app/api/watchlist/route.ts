import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleListWatchlist, handleAddWatchlist, handleRemoveWatchlist } from '@/modules/watchlist';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

export async function GET() {
  return runController(async () => handleListWatchlist());
}

export async function POST(req: NextRequest) {
  return runController(async () => { assertTrustedSameOrigin(req); return handleAddWatchlist(await req.json()); }, req);
}

export async function DELETE(req: NextRequest) {
  return runController(async () => { assertTrustedSameOrigin(req); return handleRemoveWatchlist(req.nextUrl.searchParams.get('symbol')); }, req);
}
