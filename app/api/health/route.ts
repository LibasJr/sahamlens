import { NextResponse } from 'next/server';
import { pool } from '@/shared/database/postgres.client';
import { pingRedis } from '@/shared/cache/redis-cache';

export const dynamic = 'force-dynamic';

// Endpoint termurah & paling mendasar di seluruh Production Checklist - prasyarat
// untuk uptime monitor eksternal DAN untuk QStash mengecek aplikasi hidup sebelum
// memicu job berat. Publik (tanpa auth) dengan sengaja - status hidup/mati bukan
// informasi sensitif, dan justru harus bisa dicek dari luar tanpa kredensial.
export async function GET() {
  const checks: { database: 'ok' | 'error'; redis: 'ok' | 'not_configured' | 'error' } = {
    database: 'error',
    redis: 'not_configured',
  };

  try {
    await pool.query('SELECT 1');
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  checks.redis = await pingRedis();

  // Redis boleh 'not_configured'/'error' (cache murni, aplikasi tetap jalan tanpa
  // itu) - TAPI database 'error' berarti aplikasi genuinely tidak sehat.
  const healthy = checks.database === 'ok';

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
