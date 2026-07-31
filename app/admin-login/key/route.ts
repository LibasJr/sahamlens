import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleAdminLoginByKey } from '@/modules/user';

export async function GET(req: NextRequest) {
  return runController(async () => handleAdminLoginByKey(req.nextUrl.searchParams.get('key')), req);
}
