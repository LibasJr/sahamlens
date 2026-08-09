import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isAdminFromRequestCookies } from '@/modules/user';
import {
  BrokerSummaryValidationError,
  importBrokerSummaryCsv,
} from '@/modules/broker-flow';

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!(await isAdminFromRequestCookies(await cookies()))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const result = await importBrokerSummaryCsv({
      csvText: typeof body.csvText === 'string' ? body.csvText : '',
      mode: body.mode,
      source: body.source,
      sourceFile: body.sourceFile,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BrokerSummaryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[broker-summary-import] failed', error);
    return NextResponse.json({ error: 'Import broker summary gagal.' }, { status: 500 });
  }
}
