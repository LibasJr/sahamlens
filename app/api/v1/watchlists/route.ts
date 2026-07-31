import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleListWatchlist, handleAddWatchlist } from '@/modules/watchlist';

export async function GET() {
  return runController(async () => handleListWatchlist());
}

export async function POST(req: NextRequest) {
  return runController(async () => handleAddWatchlist(await req.json()), req);
}
