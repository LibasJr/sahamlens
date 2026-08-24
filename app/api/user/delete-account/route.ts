import type { NextRequest } from 'next/server';
import { guard } from '@/lib/sahamLensGuard'; guard();
import { z } from 'zod';
import { getSession } from '@/modules/user';
import { deleteUserAccountData } from '@/modules/user/repository/account-deletion.repository';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError, UnauthorizedError, ValidationError } from '@/shared/errors/app-error';
import { SESSION_COOKIE } from '@/shared/constants/cookie-names';
import { isSyntheticAdminSession } from '@/shared/constants/identity';

const schema=z.object({ confirmation:z.literal('HAPUS AKUN') });
export async function POST(req: NextRequest) {
  return runController(async()=>{
    assertTrustedSameOrigin(req);
    const session=await getSession();
    if(!session) throw new UnauthorizedError();
    if(session.role==='admin' || isSyntheticAdminSession(session.id)) throw new ForbiddenError('Akun admin tidak dapat dihapus dari self-service.');
    const parsed=schema.safeParse(await req.json().catch(()=>null));
    if(!parsed.success) throw new ValidationError('Ketik HAPUS AKUN untuk konfirmasi.');
    await deleteUserAccountData(session.id,session.email);
    return {status:200,body:{success:true},cookiesToClear:[SESSION_COOKIE]};
  },req);
}
