import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleBuy } from '@/modules/portfolio';

export async function POST(req: NextRequest) {
  return runController(async () => handleBuy(await req.json()), req);
}
