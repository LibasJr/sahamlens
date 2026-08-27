import type { HttpResult } from '@/shared/types/http-result.types';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { apiOk } from '@/shared/http/api-response';
import { buildPitFundamentalAnalysis } from '../service/pit-fundamental-analysis.service';
import { computeCurrentFundamentalAnalysis } from '../service/current-fundamental-analysis.service';
import { buildFundamentalMetricProvenance } from '../service/fundamental-metric-provenance.service';

export async function handleGetFundamental(request: Request, rawTicker: string): Promise<HttpResult> {
  try {
    const ticker = normalizeIdxTickerParam(rawTicker);
    if (!ticker) return { status: 400, body: { error: 'Ticker tidak valid' } };

    const asOfDate = new URL(request.url).searchParams.get('as_of');
    if (asOfDate !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
        return { status: 400, body: { error: 'as_of wajib format YYYY-MM-DD' } };
      }

      const result = await buildPitFundamentalAnalysis(ticker, asOfDate);
      if (!result) {
        return {
          status: 404,
          body: {
            ticker,
            mode: 'PIT',
            requested_as_of: asOfDate,
            available: false,
            message: 'Belum ada fundamental yang diketahui pasar pada tanggal tersebut.',
          },
        };
      }
      const enriched = {
        ...result,
        provenance: buildFundamentalMetricProvenance(result),
      };
      return {
        status: 200,
        body: {
          ...enriched,
          ...apiOk(enriched, {
            dataAsOf: asOfDate,
            source: 'fundamental-history-pit',
          }),
        },
      };
    }

    const result = await getOrCompute(
      `sahamlens:cache:computed:fundamental:${ticker}`,
      CACHE_TTL_SEC.TECHNICAL,
      () => computeCurrentFundamentalAnalysis(ticker),
    );
    if ('notFound' in result) {
      return { status: 404, body: { error: 'Failed to fetch Fundamental data' } };
    }
    const enriched = {
      ...result,
      provenance: buildFundamentalMetricProvenance(result),
    };
    return {
      status: 200,
      body: {
        ...enriched,
        ...apiOk(enriched, {
          source: 'current-fundamental-computed-cache',
        }),
      },
    };
  } catch (error) {
    console.error('Fundamental API error:', error);
    return { status: 500, body: { error: 'Internal Server Error' } };
  }
}
