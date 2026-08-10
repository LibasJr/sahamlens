import { NextResponse } from 'next/server';
import { fetchPublicMacroDashboard } from '@/modules/macro/service/public-macro-dashboard.service';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

const CACHE_KEY = 'sahamlens:cache:computed:macro-dashboard';

export async function GET() {
  try {
    const data = await getOrCompute(
      CACHE_KEY,
      CACHE_TTL_SEC.MACRO_DASHBOARD,
      fetchPublicMacroDashboard,
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error('Public macro dashboard API error:', error);
    return NextResponse.json(
      { error: 'Data makro publik belum dapat dimuat' },
      { status: 503 },
    );
  }
}
