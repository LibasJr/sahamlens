import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { runMultiAgentOrchestrator } from '@/modules/ai';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

// BUILD 004 (AI Architecture) - endpoint ini SEBELUMNYA TIDAK PERNAH ADA.
// app/multi-agent/page.tsx sudah lama memanggil POST /api/agents/orchestrator
// dan selalu dapat 404 diam-diam (agentRes.ok === false, halaman stuck di
// "WAITING..."/skor 0) - baru terlihat setelah audit BUILD 001. Gerbang login+Pro
// disamakan dengan fitur AI/analisa premium lain (app/api/council, app/api/stock).
//
// BUILD 007 (Cache Layer) - getOrCompute (single-flight), bukan cacheGet/cacheSet
// manual: orkestrator ini menjalankan Yahoo Finance x2 + DCF + (opsional) Gemini
// sekaligus untuk satu simbol - kalau beberapa request cache-miss datang bersamaan
// untuk simbol yang sama, tanpa lock ini semuanya akan menjalankan komputasi mahal
// itu secara paralel alih-alih satu saja.

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }
    if (!checkProAccess(session)) {
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const body = await request.json().catch(() => ({}));
    const ticker = typeof body.ticker === 'string' && body.ticker.trim() ? body.ticker.trim() : null;
    if (!ticker) {
      return NextResponse.json({ error: 'ticker wajib diisi' }, { status: 400 });
    }

    const cacheKey = `sahamlens:cache:computed:orchestrator:${ticker.toUpperCase()}`;
    const result = await getOrCompute(cacheKey, CACHE_TTL_SEC.TECHNICAL, () => runMultiAgentOrchestrator(ticker));
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Orchestrator error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
