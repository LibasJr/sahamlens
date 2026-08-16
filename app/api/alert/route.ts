import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleListAlerts, handleCreateAlert, handleDeleteAlert } from '@/modules/watchlist';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

export async function GET() {
  return runController(async () => handleListAlerts());
}

export async function POST(req: NextRequest) {
  return runController(async () => { assertTrustedSameOrigin(req); return handleCreateAlert(await req.json()); }, req);
}

export async function DELETE(req: NextRequest) {
  return runController(async () => { assertTrustedSameOrigin(req); return handleDeleteAlert(req.nextUrl.searchParams.get('id')); }, req);
}
