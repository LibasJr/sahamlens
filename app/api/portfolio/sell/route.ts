import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleSell } from '@/modules/portfolio';

export async function POST(req: NextRequest) {
  return runController(async () => handleSell(await req.json()), req);
}
