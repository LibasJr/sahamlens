import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import {
  getLatestMacroInputEvidence,
  insertMacroInputEvidence,
} from '@/modules/macro/repository/valuation-assumption.repository';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';
import { decideEvidenceAction, parseCollectorOutput, validatePayload } from './helpers';

export const runtime = 'nodejs';
export const maxDuration = 600;
const execFileAsync = promisify(execFile);

const JOB_NAME = 'sbn-riskfree-sync';
const INPUT_KEY = 'RISK_FREE_RATE_PCT';
const SOURCE_ID = 'DJPPR_SBN_BENCHMARK_QUOTES';
const SUMBER_NAMA = 'DJPPR Kementerian Keuangan - Daftar Kuotasi Harga SUN Seri Benchmark';

interface RiskFreeSyncResult {
  status: 'SUCCESS';
  aksi: 'CATAT' | 'LEWATI';
  alasan: string;
  yieldPct: number;
  seri: string;
  tanggalData: string;
  sumberUrl: string;
  evidenceId: number | null;
}

function jakartaTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

/**
 * Ambil yield SBN benchmark 10 tahun dari berkas resmi DJPPR, lalu catat sebagai
 * bukti input makro RISK_FREE_RATE_PCT. Tidak ada angka cadangan: kalau berkas
 * resmi tidak terbaca atau tidak lolos validasi, job GAGAL dan bukti lama TIDAK
 * diganti (halaman tetap jujur menampilkan tanggal bukti terakhir).
 */
async function runSync(): Promise<RiskFreeSyncResult> {
  const script = path.resolve(process.cwd(), 'scripts/sync-sbn-riskfree-official.py');
  const { stdout, stderr } = await execFileAsync('python3', [script], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 8 * 60 * 1000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (stderr.trim()) logger.warn('sync-sbn-riskfree-official menghasilkan stderr', { stderr: stderr.slice(-2000) });

  const payload = parseCollectorOutput(stdout);
  const todayIso = jakartaTodayIso();
  const masalah = validatePayload(payload, todayIso);
  if (masalah.length) throw new Error(`bukti risk-free resmi tidak lolos validasi: ${masalah.join('; ')}`);

  const latest = await getLatestMacroInputEvidence(INPUT_KEY);
  const keputusan = decideEvidenceAction({
    payload,
    latest: latest
      ? {
          valuePct: Number(latest.valuePct),
          usableFromDate: String(latest.usableFromDate).slice(0, 10),
          marketDate: latest.marketDate ? String(latest.marketDate).slice(0, 10) : null,
          sourceUrl: latest.sourceUrl ?? null,
        }
      : null,
    todayIso,
  });

  if (keputusan.action === 'LEWATI') {
    logger.info('Bukti risk-free resmi dilewati', { alasan: keputusan.reason, tanggal: payload.tanggal_data });
    return {
      status: 'SUCCESS',
      aksi: 'LEWATI',
      alasan: keputusan.reason,
      yieldPct: payload.yield_pct,
      seri: payload.seri,
      tanggalData: payload.tanggal_data,
      sumberUrl: payload.sumber_url,
      evidenceId: null,
    };
  }

  const evidenceId = await insertMacroInputEvidence({
    inputKey: INPUT_KEY,
    valuePct: payload.yield_pct,
    marketDate: payload.tanggal_data,
    observedDate: todayIso,
    // Constraint DB: observed_date <= usable_from_date. Berkas berisi data sampai
    // tanggal pasar tertentu, tetapi kita baru membacanya hari ini -> bukti dipakai
    // mulai hari ini, tidak surut.
    usableFromDate: todayIso,
    evidenceType: 'MARKET_OBSERVATION',
    sourceTier: 'GOVERNMENT_OFFICIAL',
    sourceName: SUMBER_NAMA,
    sourceUrl: payload.sumber_url,
    methodology:
      `Yield 10Y benchmark SBN seri ${payload.seri} (kolom 10Y pada "${payload.sumber_judul}", ` +
      `harga/yield harian; baris terakhir = ${payload.tanggal_data}, harga ${payload.harga}). ` +
      `Ditarik otomatis dari berkas resmi DJPPR; SHA256 PDF ${payload.pdf_sha256}; ${payload.baris_terbaca} baris terbaca.`,
    notes: `Otomatis oleh /api/cron/${JOB_NAME}. Tidak ada angka yang dikarang: sumber = berkas resmi DJPPR Kementerian Keuangan.`,
  });

  logger.info('Bukti risk-free resmi dicatat', {
    evidenceId,
    yieldPct: payload.yield_pct,
    seri: payload.seri,
    tanggal: payload.tanggal_data,
    alasan: keputusan.reason,
  });

  return {
    status: 'SUCCESS',
    aksi: 'CATAT',
    alasan: keputusan.reason,
    yieldPct: payload.yield_pct,
    seri: payload.seri,
    tanggalData: payload.tanggal_data,
    sumberUrl: payload.sumber_url,
    evidenceId,
  };
}

async function handleGET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withJobRunLog(JOB_NAME, async () => {
      const guarded = await runWithJobConcurrencyGuard(JOB_NAME, runSync, 15 * 60);
      return guarded.executed
        ? guarded.value
        : ({ status: 'SUCCESS', aksi: 'LEWATI', alasan: 'JOB_SEDANG_BERJALAN', yieldPct: 0, seri: '', tanggalData: '', sumberUrl: '', evidenceId: null } satisfies RiskFreeSyncResult);
    });
    await recordDataSourceHealth({
      sourceId: SOURCE_ID,
      ok: true,
      force: true,
      dataObservedAt: result.tanggalData || null,
      detail: { ...result },
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('sbn-riskfree-sync gagal', { err: error });
    await recordDataSourceHealth({ sourceId: SOURCE_ID, ok: false, force: true, detail: { error: message } });
    return NextResponse.json({ error: 'Sinkronisasi yield SBN resmi gagal', detail: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}