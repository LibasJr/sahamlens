import { guard } from '@/lib/sahamLensGuard';
guard();

import type { NextRequest } from 'next/server';
import { handleGetStockAnalysis } from '@/modules/technical/controller/stock-analysis.controller';
import { runController } from '@/shared/http/next-response.adapter';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  return runController(() => handleGetStockAnalysis(request, ticker), request);
}
