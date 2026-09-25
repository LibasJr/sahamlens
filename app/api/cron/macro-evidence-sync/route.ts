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
import {
  decideEvidence,
  decideInflation,
  parseCollectorJson,
  validateErp,
  validateInflation,
  type ErpPayload,
  type EvidenceRingkas,
  type InflationPayload,
} from './helpers';

export const runtime = 'nodejs';
export const maxDuration = 600;
const execFileAsync = promisify(execFile);

const JOB_NAME = 'macro-evidence-sync';
const SUMBER_ERP = 'DAMODARAN_COUNTRY_RISK';
const SUMBER_INFLASI = 'BI_INFLATION_TARGET';

interface LangkahHasil {
  langkah: 'ERP' | 'INFLASI';
  status: 'SUCCESS' | 'PARTIAL' | 'UNVERIFIED';
  aksi?: 'CATAT' | 'LEWATI';
  alasan?: string;
  [kunci: string]: unknown;
}

interface SyncResult {
  status: 'SUCCESS' | 'PARTIAL';
  erp: LangkahHasil;
  inflasi: LangkahHasil;
  tanggalJalan: string;
}

function jakartaTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get('authorization') ?? '';
  const harapan = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (harapan === 'Bearer ') return false;
  return timingSafeStringEqual(header, harapan);
}

async function jalankanSkrip(nama: string, argumen: string[]): Promise<string> {
  const skrip = path.resolve(process.cwd(), 'scripts', nama);
  const { stdout, stderr } = await execFileAsync('python3', [skrip, ...argumen], {
    timeout: 480_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (stderr.trim()) logger.warn(`${JOB_NAME}: stderr skrip`, { skrip: nama, stderr: stderr.slice(0, 400) });
  return stdout;
}

function ringkas(baris: { valuePct: number; marketDate: string | null; usableFromDate: string; sourceUrl: string | null } | null): EvidenceRingkas | null {
  return baris == null
    ? null
    : { valuePct: baris.valuePct, marketDate: baris.marketDate, usableFromDate: baris.usableFromDate, sourceUrl: baris.sourceUrl };
}

async function sinkronErp(todayIso: string): Promise<LangkahHasil> {
  let payload: ErpPayload;
  try {
    payload = parseCollectorJson<ErpPayload>(await jalankanSkrip('sync-erp-damodaran.py', []));
  } catch (error) {
    const pesan = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    await recordDataSourceHealth({ sourceId: SUMBER_ERP, ok: false, force: true, detail: { error: pesan } });
    logger.warn(`${JOB_NAME}: pengumpul ERP gagal`, { pesan });
    return { langkah: 'ERP', status: 'UNVERIFIED', alasan: pesan };
  }

  const pelanggaran = validateErp(payload, todayIso);
  if (pelanggaran.length > 0) {
    await recordDataSourceHealth({ sourceId: SUMBER_ERP, ok: false, force: true, detail: { pelanggaran } });
    throw new Error(`bukti ERP tidak lolos validasi: ${pelanggaran.join('; ')}`);
  }

  const latest = await getLatestMacroInputEvidence('EQUITY_RISK_PREMIUM_PCT');
  const keputusan = decideEvidence({ marketDate: payload.tanggal_update, nilai: payload.nilai_pct, latest: ringkas(latest), todayIso });

  if (keputusan.action === 'LEWATI') {
    await recordDataSourceHealth({ sourceId: SUMBER_ERP, ok: true, force: true, dataObservedAt: payload.tanggal_update, detail: { aksi: 'LEWATI', alasan: keputusan.reason, edisi: payload.edisi } });
    return { langkah: 'ERP', status: 'SUCCESS', aksi: 'LEWATI', alasan: keputusan.reason, nilaiPct: payload.nilai_pct, edisi: payload.edisi };
  }

  const evidenceId = await insertMacroInputEvidence({
    inputKey: 'EQUITY_RISK_PREMIUM_PCT',
    valuePct: payload.nilai_pct,
    marketDate: payload.tanggal_update,
    observedDate: todayIso,
    // Constraint DB: observed_date <= usable_from_date. Kita membaca edisi hari ini -> mulai berlaku hari ini.
    usableFromDate: todayIso,
    evidenceType: 'RESEARCH_ESTIMATE',
    sourceTier: 'ACADEMIC_RESEARCH',
    sourceName: payload.sumber_nama,
    sourceUrl: payload.sumber_url,
    methodology:
      `Kolom "${payload.kolom}" negara ${payload.negara} pada dataset ${payload.edisi} ` +
      `(date of update ${payload.tanggal_update}). Mature-market ERP ${payload.mature_erp_pct ?? 'tidak tersedia'}%, ` +
      `country risk premium ${payload.country_risk_premium_pct ?? 'tidak tersedia'}%, varian CDS ${payload.erp_cds_pct ?? 'tidak tersedia'}%. ` +
      `SHA256 berkas ${payload.berkas_sha256}.`,
    notes: `Otomatis oleh /api/cron/${JOB_NAME}. Angka diambil apa adanya dari berkas resmi; tidak ada estimasi ulang.`,
  });
  await recordDataSourceHealth({ sourceId: SUMBER_ERP, ok: true, force: true, dataObservedAt: payload.tanggal_update, detail: { aksi: 'CATAT', edisi: payload.edisi, nilai: payload.nilai_pct } });
  logger.info('Bukti ERP resmi dicatat', { evidenceId, nilaiPct: payload.nilai_pct, edisi: payload.edisi, alasan: keputusan.reason });
  return { langkah: 'ERP', status: 'SUCCESS', aksi: 'CATAT', alasan: keputusan.reason, nilaiPct: payload.nilai_pct, edisi: payload.edisi, evidenceId };
}

async function verifikasiInflasi(todayIso: string): Promise<LangkahHasil> {
  const latestMid = await getLatestMacroInputEvidence('INFLATION_TARGET_MID_PCT');
  const latestUpper = await getLatestMacroInputEvidence('INFLATION_TARGET_UPPER_PCT');
  const sumber = latestMid?.sourceUrl ?? latestUpper?.sourceUrl ?? null;
  if (sumber == null || !sumber.startsWith('https://www.bi.go.id/')) {
    await recordDataSourceHealth({ sourceId: SUMBER_INFLASI, ok: false, force: true, detail: { error: 'URL sumber resmi tidak tercatat pada bukti terakhir' } });
    return { langkah: 'INFLASI', status: 'PARTIAL', alasan: 'URL sumber resmi tidak tercatat' };
  }

  let stdout: string;
  try {
    stdout = await jalankanSkrip('verify-inflation-target.py', ['--source-url', sumber]);
  } catch (error) {
    const pesan = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    await recordDataSourceHealth({ sourceId: SUMBER_INFLASI, ok: false, force: true, detail: { error: pesan, sumberUrl: sumber } });
    logger.warn(`${JOB_NAME}: verifikasi sasaran inflasi gagal`, { pesan, sumberUrl: sumber });
    return { langkah: 'INFLASI', status: 'UNVERIFIED', alasan: pesan, sumberUrl: sumber };
  }

  const payload = parseCollectorJson<InflationPayload>(stdout);
  const pelanggaran = validateInflation(payload, todayIso);
  if (pelanggaran.length > 0) {
    await recordDataSourceHealth({ sourceId: SUMBER_INFLASI, ok: false, force: true, detail: { pelanggaran } });
    throw new Error(`bukti sasaran inflasi tidak lolos validasi: ${pelanggaran.join('; ')}`);
  }

  const keputusan = decideInflation({
    midPct: payload.mid_pct,
    upperPct: payload.upper_pct,
    latestMid: ringkas(latestMid),
    latestUpper: ringkas(latestUpper),
    todayIso,
  });

  if (keputusan.action === 'LEWATI') {
    await recordDataSourceHealth({ sourceId: SUMBER_INFLASI, ok: true, force: true, dataObservedAt: todayIso, detail: { aksi: 'LEWATI', alasan: keputusan.reason, tahun: payload.tahun, fingerprint: payload.fingerprint } });
    return { langkah: 'INFLASI', status: 'SUCCESS', aksi: 'LEWATI', alasan: keputusan.reason, midPct: payload.mid_pct, upperPct: payload.upper_pct, tahun: payload.tahun };
  }

  const idBaru: number[] = [];
  const bagian: Array<{ key: 'INFLATION_TARGET_MID_PCT' | 'INFLATION_TARGET_UPPER_PCT'; nilai: number }> = [
    { key: 'INFLATION_TARGET_MID_PCT', nilai: payload.mid_pct },
    { key: 'INFLATION_TARGET_UPPER_PCT', nilai: payload.upper_pct },
  ];
  for (const baris of bagian) {
    const evidenceId = await insertMacroInputEvidence({
      inputKey: baris.key,
      valuePct: baris.nilai,
      marketDate: todayIso,
      observedDate: todayIso,
      usableFromDate: todayIso,
      evidenceType: 'POLICY_TARGET',
      sourceTier: 'GOVERNMENT_OFFICIAL',
      sourceName: `Bank Indonesia - Sasaran Inflasi ${payload.tahun ?? ''}`.trim(),
      sourceUrl: payload.sumber_url,
      methodology:
        `Pernyataan resmi Bank Indonesia: sasaran inflasi ${payload.mid_pct}\u00b1${payload.pita_pct}% ` +
        `(batas atas ${payload.upper_pct}%)${payload.tahun ? ` pada ${payload.tahun}` : ''}. ` +
        `Dibaca dari halaman resmi bi.go.id dengan fingerprint ${payload.fingerprint}. ` +
        `Kutipan: "${payload.kutipan.slice(0, 180)}"`,
      notes: `Otomatis oleh /api/cron/${JOB_NAME} (verifikasi berkala; baris baru hanya saat angka resmi berubah).`,
    });
    idBaru.push(evidenceId);
  }
  await recordDataSourceHealth({ sourceId: SUMBER_INFLASI, ok: true, force: true, dataObservedAt: todayIso, detail: { aksi: 'CATAT', tahun: payload.tahun, mid: payload.mid_pct, upper: payload.upper_pct } });
  logger.info('Bukti sasaran inflasi dicatat', { evidenceIds: idBaru, mid: payload.mid_pct, upper: payload.upper_pct, tahun: payload.tahun });
  return { langkah: 'INFLASI', status: 'SUCCESS', aksi: 'CATAT', alasan: keputusan.reason, midPct: payload.mid_pct, upperPct: payload.upper_pct, tahun: payload.tahun, evidenceIds: idBaru };
}

async function runSync(): Promise<SyncResult> {
  const tanggalJalan = jakartaTodayIso();
  const erp = await sinkronErp(tanggalJalan);
  const inflasi = await verifikasiInflasi(tanggalJalan);
  const status = erp.status === 'SUCCESS' && inflasi.status === 'SUCCESS' ? 'SUCCESS' : 'PARTIAL';
  return { status, erp, inflasi, tanggalJalan };
}

async function handleGET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withJobRunLog(JOB_NAME, async () => {
      const guarded = await runWithJobConcurrencyGuard(JOB_NAME, runSync, 15 * 60);
      return guarded.executed ? guarded.value : ({ status: 'PARTIAL', erp: { langkah: 'ERP', status: 'PARTIAL', alasan: 'JOB_SEDANG_BERJALAN' }, inflasi: { langkah: 'INFLASI', status: 'PARTIAL', alasan: 'JOB_SEDANG_BERJALAN' }, tanggalJalan: jakartaTodayIso() } satisfies SyncResult);
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('macro-evidence-sync gagal', { err: error });
    return NextResponse.json({ error: 'Sinkronisasi bukti makro resmi gagal', detail: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}