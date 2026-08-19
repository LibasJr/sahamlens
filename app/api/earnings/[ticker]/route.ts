import { runController } from '@/shared/http/next-response.adapter';
import { ServiceUnavailableError } from '@/shared/errors/app-error';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { checkPublicComputeBudget, rateLimitExceeded } from '@/shared/security/api-rate-limit';
import { fetchPublicEarningsData } from '@/modules/fundamental/service/public-earnings-data.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { idxTickerParamSchema } from '@/shared/market/ticker-schema';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  // Gerbang biaya tetap DI LUAR runController: rateLimitExceeded() sudah mengembalikan
  // NextResponse 429 lengkap dengan Retry-After, dan membungkusnya berarti menerjemahkan
  // bentuk yang sudah benar bolak-balik tanpa memperbaiki apa pun.
  const budget = await checkPublicComputeBudget(_request.headers, 'earnings');
  if (!budget.allowed) return rateLimitExceeded(budget);

  return runController(async () => {
    const { ticker: rawTicker } = await params;
    const ticker = parseOrThrow(idxTickerParamSchema, rawTicker);

    // 503 dipertahankan sebagai ServiceUnavailableError berikut penyebab aslinya:
    // Yahoo Finance yang sedang tidak menjawab itu kondisi fana, dan klien perlu bisa
    // membedakannya dari kerusakan aplikasi. Dulu console.error tanpa X-Request-Id.
    let data;
    try {
      data = await getOrCompute(
        'sahamlens:cache:computed:earnings:' + ticker,
        CACHE_TTL_SEC.EARNINGS,
        () => fetchPublicEarningsData(ticker),
      );
    } catch (error) {
      throw new ServiceUnavailableError(
        'Data earnings publik belum tersedia untuk emiten ini',
        { cause: error },
      );
    }

    return { status: 200, body: data };
  });
}
