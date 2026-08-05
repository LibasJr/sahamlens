import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError, ValidationError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { runFundamentalBackfillImport } from '@/modules/fundamental/service/fundamental-backfill-import.service';

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return runController(async () => {
    if (!isAdminFromRequestCookies(await cookies())) throw new ForbiddenError();
    if (typeof body.csvText !== 'string') throw new ValidationError('csvText wajib string');
    const result = await runFundamentalBackfillImport({
      csvText: body.csvText,
      dryRun: body.mode !== 'insert',
      skipEmptyRows: body.skipEmptyRows !== false,
      percentInput: body.percentInput === 'decimal' ? 'decimal' : 'percent',
      source: typeof body.source === 'string' ? body.source : undefined,
    });
    return { status: 200, body: result };
  });
}
