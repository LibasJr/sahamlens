import type { HttpResult } from '@/shared/types/http-result.types';
import { checkPublicComputeBudget, rateLimitResult } from '@/shared/security/api-rate-limit';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import { buildStockComparison } from '../service/stock-comparison.service';

export async function handleGetStockComparison(request: Request): Promise<HttpResult> {
  const budget = await checkPublicComputeBudget(request.headers, 'compare');
  if (!budget.allowed) return rateLimitResult(budget);

  const session = await getSession();
  if (!(await hasOpenOrProAccess(session))) {
    return { status: 402, body: { error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' } };
  }

  const { searchParams } = new URL(request.url);
  const symbol1 = searchParams.get('symbol1') || 'BBCA.JK';
  const symbol2 = searchParams.get('symbol2');
  const result = await buildStockComparison(symbol1, symbol2);
  if (!result) return { status: 404, body: { error: 'Data tidak tersedia untuk salah satu simbol' } };

  return { status: 200, body: result };
}
