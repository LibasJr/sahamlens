import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleListAlerts, handleCreateAlert, handleDeleteAlert } from '@/modules/watchlist';

export async function GET() {
  return runController(async () => handleListAlerts());
}

export async function POST(req: NextRequest) {
  return runController(async () => handleCreateAlert(await req.json()), req);
}

export async function DELETE(req: NextRequest) {
  return runController(async () => handleDeleteAlert(req.nextUrl.searchParams.get('id')), req);
}
