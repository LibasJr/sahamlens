import { guard } from '@/lib/sahamLensGuard';
guard();

import { runController } from '@/shared/http/next-response.adapter';
import { cacheGet } from '@/shared/cache/redis-cache';

// BUILD 006/007 - baca cache-first (diisi app/api/cron/breakout-scan setiap 5 menit).
// Public-read karena /breakout-radar ditampilkan sebagai menu guest. Endpoint ini hanya
// membaca hasil scan cache publik; pemindaian mahal tetap tugas cron, bukan request user.
const CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

export async function GET() {
  return runController(async () => {
    const cached = await cacheGet<any>(CACHE_KEY);
    if (cached) {
      return { status: 200, body: cached };
    }

    // Cache belum terisi - jawab kosong, JANGAN memindai. Pemindaian adalah tugas
    // /api/cron/breakout-scan; menjalankannya di request pengguna berarti satu orang
    // menanggung full active-universe fetch Yahoo dan halaman menggantung puluhan detik.
    return { status: 200, body: { data: [], crossSignals: { golden: [], dead: [] }, lastUpdate: null } };
    // catch generik dihapus: runController menghasilkan 500 yang sama sambil mencatat
    // error lengkap ke shared/logger dengan X-Request-Id yang juga diterima klien.
  });
}
