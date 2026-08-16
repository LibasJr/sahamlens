import { guard } from '@/lib/sahamLensGuard'; guard();
import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError, NotFoundError, ValidationError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getTpclValidationRun, listRecentTpclValidationRuns } from '@/modules/recommendation/repository/tpcl-validation-run.repository';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  return runController(async () => {
    if (!(await isAdminFromRequestCookies(await cookies()))) throw new ForbiddenError();
    const id = req.nextUrl.searchParams.get('id');
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ValidationError('run id tidak valid');
      const run = await getTpclValidationRun(id);
      if (!run) throw new NotFoundError('TP/CL validation run tidak ditemukan');
      return { status: 200, body: run };
    }
    return { status: 200, body: { runs: await listRecentTpclValidationRuns(10) } };
  }, req);
}
