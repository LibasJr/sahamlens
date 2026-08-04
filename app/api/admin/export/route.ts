import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { handleAdminExport } from '@/modules/user';

export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
  const limit = req.nextUrl.searchParams.get('limit') || undefined;
  return runController(async () => handleAdminExport(await cookies(), { cursor, limit }), req);
}
