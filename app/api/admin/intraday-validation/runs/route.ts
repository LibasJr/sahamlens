import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { z } from 'zod';
import { type NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { isAdminFromRequestCookies } from '@/modules/user';
import { listValidationRuns } from '@/modules/intraday';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Dipaginasi dan dibatasi - histori run bertambah terus, dan mengembalikan seluruhnya
// adalah cara paling mudah membuat endpoint admin meledak seiring waktu.
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export async function GET(req: NextRequest) {
  return runController(async () => {
    if (!(await isAdminFromRequestCookies(await cookies()))) throw new ForbiddenError();
    const { limit, offset } = parseOrThrow(querySchema, {
      limit: req.nextUrl.searchParams.get('limit') ?? undefined,
      offset: req.nextUrl.searchParams.get('offset') ?? undefined,
    });
    const runs = await listValidationRuns(limit, offset);
    return { status: 200, body: { runs, limit, offset, hasMore: runs.length === limit } };
  }, req);
}
