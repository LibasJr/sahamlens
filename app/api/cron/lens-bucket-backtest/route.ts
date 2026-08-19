import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { runAndSaveLensBucketBacktest } from '@/modules/lens-radar/service/bucket-backtest.service';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

export const maxDuration = 300;

// DUA PENJADWAL, DUA GERBANG - pola yang sama dengan broker-summary-scan.
//
// KOREKSI 2026-08-12: sempat saya ubah menjadi POST + signature QStash saja, atas
// asumsi QStash adalah satu-satunya penjadwal. Itu SALAH - job ini dijalankan
// systemd timer di VPS, yang memanggil lewat GET + CRON_SECRET dan tidak bisa
// menghasilkan signature QStash. Penggantian itu mematikan job-nya tanpa jejak:
// systemd menerima 405, dan tidak ada apa pun di aplikasi yang menunjukkannya.
//
// GET  + CRON_SECRET     -> systemd timer (penjadwal saat ini)
// POST + signature QStash -> kalau suatu saat dipindah ke QStash, tinggal arahkan
async function isAuthorizedCron(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${cronSecret}`);
}

async function handleGET(req: NextRequest) {
  if (!(await isAuthorizedCron(req))) {
    logger.warn('Menolak GET /api/cron/lens-bucket-backtest - CRON_SECRET tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return jalankan();
}

async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak POST /api/cron/lens-bucket-backtest - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return jalankan();
}

async function jalankan() {
  try {
    const result = await withJobRunLog('lens-bucket-backtest', async () => {
      const stats = await runAndSaveLensBucketBacktest();
      return {
        asOfDate: stats.asOfDate,
        scoreVersion: stats.scoreVersion,
        requestedScoreVersion: stats.requestedScoreVersion,
        rejectedRows: stats.rejectedRows,
        unversionedRows: stats.unversionedRows,
        savedRows: stats.savedRows,
        sourceRows: stats.sourceRows,
        uniqueTickers: stats.uniqueTickers,
        skippedGocapRows: stats.skippedGocapRows,
        skippedDrawdownTrades: stats.skippedDrawdownTrades,
        drawdownTrades: stats.drawdownTrades,
      };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job lens-bucket-backtest gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
