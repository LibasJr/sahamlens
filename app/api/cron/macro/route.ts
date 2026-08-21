import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { refreshUsdIdr } from '@/modules/macro';
import { fetchPublicMacroDashboard } from '@/modules/macro/service/public-macro-dashboard.service';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

// Proof-of-concept Fase 1 Scheduler Architecture: pola Cron -> Worker LANGSUNG
// (tanpa queue/fan-out) - job global paling sederhana, dipilih karena risikonya
// paling rendah untuk membuktikan pola signature-verification + job_run_log
// sebelum dipakai job yang lebih mahal/berisiko (AI Scan, Watchlist Alert).
//
// Endpoint ini TIDAK dipanggil browser - dipicu QStash Schedule (belum didaftarkan
// live, lihat catatan roadmap) yang mengirim POST bertanda tangan ke sini.
async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const authorization = req.headers.get('authorization');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody, authorization);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/macro - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('macro', refreshUsdIdr);

    // BUG FIX (2026-08-14, laporan pengguna "menu Macro lambat"): job ini SEBELUMNYA
    // hanya me-refresh indikator USD_IDR ke Postgres - TIDAK PERNAH menyentuh cache
    // Redis (COMPUTED_CACHE_KEY.MACRO_DASHBOARD) yang benar-benar dibaca /api/macro.
    // Akibatnya dashboard makro publik TIDAK PERNAH di-pre-warm sama sekali; cache-nya
    // (TTL 30 menit) hanya terisi kalau ada pengunjung yang kebetulan datang tepat saat
    // cache kosong, dan pengunjung itu yang menanggung komputasi live penuh. Job ini
    // sudah berjalan terjadwal (lihat config/scheduled-jobs.json) - dipakai ulang untuk
    // pre-warm, TANPA perlu registrasi jadwal baru di QStash/systemd.
    try {
      const dashboard = await fetchPublicMacroDashboard();
      await cacheSet(COMPUTED_CACHE_KEY.MACRO_DASHBOARD, dashboard, CACHE_TTL_SEC.MACRO_DASHBOARD);
    } catch (warmErr) {
      // Kegagalan pre-warm TIDAK BOLEH menggagalkan job utama (refresh USD_IDR sudah
      // berhasil di atas) - /api/macro tetap punya fallback getOrCompute live kalau
      // pre-warm ini gagal, cuma kehilangan keuntungan pre-warm-nya.
      logger.warn('Pre-warm cache dashboard makro gagal (job utama tetap sukses)', { warmErr });
    }

    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job macro gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
