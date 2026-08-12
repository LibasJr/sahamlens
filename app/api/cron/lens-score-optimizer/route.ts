import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { runLensScoreOptimizer } from '@/modules/lens-radar/service/lens-score-optimizer.service';

export const maxDuration = 300;

// PENYERAGAMAN 2026-08-12. Route ini dulu diautentikasi dengan CRON_SECRET lewat
// `Authorization: Bearer`, karena penjadwalnya adalah cron NATIVE VERCEL - satu-satunya
// yang memang mengirim header itu. Cron Vercel sudah dihapus (vercel.json tinggal
// $schema) dan seluruh penjadwalan pindah ke QStash, jadi CRON_SECRET tidak punya
// pengirim lagi.
//
// Membiarkannya berarti menyimpan DUA mekanisme autentikasi untuk SATU penjadwal, dan
// dua di antara dua belas jadwal harus diingat sebagai pengecualian - persis bentuk
// percabangan yang menjadi sumber bug di tempat lain (dua ATR, tiga EMA). Sekarang
// ketiga belasnya seragam: POST + signature QStash.
export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/lens-score-optimizer - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('lens-score-optimizer', async () => runLensScoreOptimizer());
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job lens-score-optimizer gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
