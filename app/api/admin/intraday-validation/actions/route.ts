import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { z } from 'zod';
import { type NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError, ConflictError, ValidationError } from '@/shared/errors/app-error';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { getTrustedAppOrigin } from '@/shared/http/server-origin';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { isAdminFromRequestCookies } from '@/modules/user';
import {
  freezeIntradayOosProtocol,
  proposeIntradayThreshold,
  proposeIntradayWeights,
  resetIntradayResearchData,
  runIntradayCollection,
  runIntradayValidation,
  simulateIntradayThresholds,
} from '@/modules/intraday';

// Kerja berat dijalankan di sini, bukan saat halaman dirender. Lock terdistribusi
// memastikan dua admin yang menekan tombol bersamaan tidak menjalankan dua backfill
// terhadap database yang sama.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD');

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('collect_data'),
    tickers: z.array(z.string().min(1).max(12)).max(200).optional(),
    lookbackDays: z.number().int().min(1).max(60).optional(),
  }),
  z.object({
    action: z.literal('run_validation'),
    oosOnly: z.boolean().optional(),
    fromDate: isoDate.optional(),
    toDate: isoDate.optional(),
  }),
  z.object({ action: z.literal('freeze_oos') }),
  z.object({ action: z.literal('reset_research'), confirmation: z.literal('RESET_INTRADAY_RESEARCH') }),
  z.object({
    action: z.literal('threshold_simulation'),
    horizon: z.enum(['H15', 'H30', 'H60', 'EOD']).optional(),
    thresholds: z.array(z.number().min(0).max(100)).max(25).optional(),
  }),
  z.object({
    action: z.literal('threshold_proposal'),
    threshold: z.number().min(0).max(100),
    horizon: z.enum(['H15', 'H30', 'H60', 'EOD']).optional(),
  }),
  z.object({
    action: z.literal('weight_proposal'),
    horizon: z.enum(['H15', 'H30', 'H60', 'EOD']).optional(),
  }),
]);

/**
 * Cookie admin adalah SameSite cookie milik aplikasi ini; pemeriksaan Origin di bawah
 * adalah lapisan kedua supaya form lintas situs tidak bisa memicu backfill/freeze.
 * Request tanpa header Origin (mis. curl admin dari server) tetap diizinkan - yang
 * ditolak hanyalah Origin yang JELAS berbeda dari origin aplikasi.
 */
function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get('origin');
  if (!origin) return;
  const trusted = getTrustedAppOrigin();
  const host = req.headers.get('host');
  const allowed = new Set([trusted, host ? `https://${host}` : '', host ? `http://${host}` : ''].filter(Boolean));
  if (!allowed.has(origin.replace(/\/$/, ''))) {
    throw new ForbiddenError('Origin tidak dikenali');
  }
}

export async function POST(req: NextRequest) {
  return runController(async () => {
    if (!(await isAdminFromRequestCookies(await cookies()))) throw new ForbiddenError();
    assertSameOrigin(req);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new ValidationError('Body harus JSON');
    }
    const body = parseOrThrow(bodySchema, raw);

    // Aksi baca-saja tidak perlu lock; aksi yang menulis dijaga lock per jenis aksi.
    if (body.action === 'threshold_simulation') {
      const result = await simulateIntradayThresholds({ horizon: body.horizon, thresholds: body.thresholds });
      return { status: 200, body: result };
    }

    const lockName = `intraday-validation:${body.action}`;
    const guarded = await runWithJobConcurrencyGuard(lockName, async () => {
      switch (body.action) {
        case 'collect_data': {
          const result = await runIntradayCollection({
            tickers: body.tickers,
            lookbackDays: body.lookbackDays,
            // Request browser melewati Cloudflare yang memiliki batas ~100 detik.
            // Berhenti rapi di bawahnya; upsert idempoten membuat admin bisa menekan
            // lagi sampai backfill selesai tanpa data ganda. Timer VPS tidak lewat
            // Cloudflare dan tetap memakai anggaran 240 detik di route cron sendiri.
            budgetMs: 70_000,
          });
          return result;
        }
        case 'run_validation':
          return runIntradayValidation({
            triggeredBy: 'admin',
            oosOnly: body.oosOnly,
            fromDate: body.fromDate,
            toDate: body.toDate,
          });
        case 'freeze_oos':
          return freezeIntradayOosProtocol({ frozenBy: 'admin' });
        case 'reset_research':
          return resetIntradayResearchData();
        case 'threshold_proposal':
          return proposeIntradayThreshold({
            threshold: body.threshold,
            horizon: body.horizon,
            proposedBy: 'admin',
          });
        case 'weight_proposal':
          return proposeIntradayWeights({ horizon: body.horizon, proposedBy: 'admin' });
        default:
          throw new ValidationError('Aksi tidak dikenal');
      }
    }, 10 * 60);

    if (!guarded.executed) {
      throw new ConflictError('Aksi yang sama sedang berjalan. Tunggu sampai selesai.');
    }

    // Audit log: siapa (admin), aksi apa, dan hasil ringkasnya. Tidak pernah memuat
    // credential/token apa pun.
    logger.info('Intraday Validation Lab action', { action: body.action, outcome: 'SUCCESS' });
    return { status: 200, body: guarded.value };
  }, req);
}
