import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { cacheGet } from '@/shared/cache/redis-cache';

// BUILD 006/007 - baca cache-first (diisi app/api/cron/breakout-scan setiap 5 menit).
// Public-read karena /breakout-radar ditampilkan sebagai menu guest. Endpoint ini hanya
// membaca hasil scan cache publik; pemindaian mahal tetap tugas cron, bukan request user.
const CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

export async function GET() {
  try {
    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Cache belum terisi - jawab kosong, JANGAN memindai. Pemindaian adalah tugas
    // /api/cron/breakout-scan; menjalankannya di request pengguna berarti satu orang
    // menanggung ~109 fetch Yahoo dan halaman menggantung puluhan detik.
    return NextResponse.json({ data: [], crossSignals: { golden: [], dead: [] }, lastUpdate: null });
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
