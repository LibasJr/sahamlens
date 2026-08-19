import type { HttpResult } from '@/shared/types/http-result.types';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { isAdminServer } from '@/modules/user';
import {
  BrokerSummaryValidationError,
  importBrokerDistributionJson,
  importBrokerSummaryCsv,
} from '@/modules/broker-flow';
import { logger } from '@/shared/logger/logger';

export async function handleBrokerSummaryImport(request: Request): Promise<HttpResult> {
  assertTrustedSameOrigin(request);
  if (!(await isAdminServer())) {
    return { status: 403, body: { error: 'Admin access required', code: 'ADMIN_REQUIRED' } };
  }

  try {
    const body = await request.json();
    const format = body.format === 'stockbit-json' ? 'stockbit-json' : 'csv';
    const result = format === 'stockbit-json'
      ? await importBrokerDistributionJson({
          jsonText: typeof body.jsonText === 'string' ? body.jsonText : '',
          ticker: typeof body.ticker === 'string' ? body.ticker : '',
          mode: body.mode,
          source: body.source,
          sourceFile: body.sourceFile,
        })
      : await importBrokerSummaryCsv({
          csvText: typeof body.csvText === 'string' ? body.csvText : '',
          mode: body.mode,
          source: body.source,
          sourceFile: body.sourceFile,
        });
    return { status: 200, body: result };
  } catch (error) {
    if (error instanceof BrokerSummaryValidationError) {
      return { status: 400, body: { error: error.message, code: 'VALIDATION_ERROR' } };
    }
    logger.error('broker-summary-import failed', { error });
    return { status: 500, body: { error: 'Import broker summary gagal.', code: 'INTERNAL_ERROR' } };
  }
}
