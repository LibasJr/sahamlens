import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleSignup } from '@/modules/user';

export async function POST(req: NextRequest) {
  return runController(async () => handleSignup(await req.json()), req);
}
