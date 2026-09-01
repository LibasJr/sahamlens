import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleAddWatchlist, handleListWatchlist, handleRemoveWatchlist } from '@/modules/watchlist';
import { UnauthorizedError } from '@/shared/errors/app-error';

function requireDesktopBearer(request: Request) {
  if (!/^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? '')) throw new UnauthorizedError('Token desktop diperlukan');
}

export async function GET(request: NextRequest) {
  return runController(async () => { requireDesktopBearer(request); return handleListWatchlist(); }, request);
}

export async function POST(request: NextRequest) {
  return runController(async () => { requireDesktopBearer(request); return handleAddWatchlist(await request.json()); }, request);
}

export async function DELETE(request: NextRequest) {
  return runController(async () => { requireDesktopBearer(request); return handleRemoveWatchlist(request.nextUrl.searchParams.get('symbol')); }, request);
}
