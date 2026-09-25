/**
 * Helper murni rute /api/cron/sbn-riskfree-sync.
 *
 * Dipisah dari route.ts karena Next.js hanya mengizinkan ekspor metode HTTP +
 * config di berkas rute. Semua fungsi di sini murni (tanpa I/O) supaya bisa diuji.
 */

export interface RiskFreeCollectorPayload {
  status: string;
  reason?: string;
  input_key: string;
  tenor: string;
  seri: string;
  tanggal_data: string;
  harga: number;
  yield_pct: number;
  sumber_nama: string;
  sumber_judul: string;
  sumber_terbit: string;
  sumber_url: string;
  pdf_sha256: string;
  baris_terbaca: number;
  tanggal_data_sama_dengan_terbit?: boolean;
  seri_per_tenor?: Record<string, string>;
}

export interface LatestEvidenceRingkas {
  valuePct: number;
  usableFromDate: string;
  marketDate: string | null;
  sourceUrl: string | null;
  seri?: string | null;
}

export interface KeputusanBukti {
  action: 'CATAT' | 'LEWATI';
  reason: string;
}

export const INPUT_KEY_RISK_FREE = 'RISK_FREE_RATE_PCT';
export const TENOR_WAJIB = '10Y';
/** Hanya berkas resmi DJPPR Kementerian Keuangan yang boleh menjadi sumber. */
export const HOST_SUMBER_RESMI = 'api-djppr.kemenkeu.go.id';
export const BATAS_UMUR_HARI = 45;
export const TOLERANSI_NILAI = 0.005;

const RENTANG_YIELD = { min: 3, max: 20 };
const RENTANG_HARGA = { min: 50, max: 200 };
const MIN_BARIS = 30;

/** Ambil JSON dari keluaran skrip; lempar bila pengumpul melaporkan GAGAL. */
export function parseCollectorOutput(stdout: string): RiskFreeCollectorPayload {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('keluaran pengumpul SBN tidak berisi JSON');
  let parsed: RiskFreeCollectorPayload;
  try {
    parsed = JSON.parse(stdout.slice(start, end + 1)) as RiskFreeCollectorPayload;
  } catch {
    throw new Error('keluaran pengumpul SBN bukan JSON yang sah');
  }
  if (parsed.status !== 'SUKSES') {
    throw new Error(`pengumpul SBN melaporkan ${parsed.status ?? 'TANPA_STATUS'}: ${parsed.reason ?? 'tanpa alasan'}`);
  }
  return parsed;
}

function selisihHari(tanggalIso: string, acuanIso: string): number {
  const a = Date.parse(`${tanggalIso}T00:00:00Z`);
  const b = Date.parse(`${acuanIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Daftar pelanggaran bukti resmi. Kosong = boleh dicatat.
 * Sengaja ketat: lebih baik job GAGAL dan alarm berbunyi daripada angka acuan
 * tersimpan dari berkas yang salah baca.
 */
export function validatePayload(payload: RiskFreeCollectorPayload, todayIso: string): string[] {
  const masalah: string[] = [];
  if (payload.input_key !== INPUT_KEY_RISK_FREE) masalah.push(`input_key tak terduga: ${payload.input_key}`);
  if (payload.tenor !== TENOR_WAJIB) masalah.push(`tenor tak terduga: ${payload.tenor}`);
  if (!/^FR\d{4}$/.test(String(payload.seri ?? ''))) masalah.push(`kode seri tidak sah: ${payload.seri}`);
  if (!Number.isFinite(payload.yield_pct) || payload.yield_pct < RENTANG_YIELD.min || payload.yield_pct > RENTANG_YIELD.max) {
    masalah.push(`yield di luar rentang wajar: ${payload.yield_pct}`);
  }
  if (!Number.isFinite(payload.harga) || payload.harga < RENTANG_HARGA.min || payload.harga > RENTANG_HARGA.max) {
    masalah.push(`harga di luar rentang wajar: ${payload.harga}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.tanggal_data ?? ''))) masalah.push(`tanggal data tidak sah: ${payload.tanggal_data}`);
  else {
    const umur = selisihHari(String(payload.tanggal_data), todayIso);
    if (Number.isNaN(umur)) masalah.push('tanggal data tidak dapat dibandingkan');
    else if (umur < 0) masalah.push(`tanggal data di masa depan: ${payload.tanggal_data}`);
    else if (umur > BATAS_UMUR_HARI) masalah.push(`bukti resmi terlalu tua: ${payload.tanggal_data} (${umur} hari)`);
  }
  if (!/^[A-Za-z0-9./_?=&:-]+$/.test(String(payload.sumber_url ?? ''))) masalah.push('sumber_url tidak sah');
  else if (!String(payload.sumber_url).startsWith(`https://${HOST_SUMBER_RESMI}/web/api/v1/media/`)) {
    masalah.push(`sumber bukan berkas resmi DJPPR: ${payload.sumber_url}`);
  }
  if (!/^[0-9a-f]{64}$/.test(String(payload.pdf_sha256 ?? ''))) masalah.push('sidik PDF tidak sah');
  if (!Number.isFinite(payload.baris_terbaca) || payload.baris_terbaca < MIN_BARIS) {
    masalah.push(`terlalu sedikit baris terbaca: ${payload.baris_terbaca}`);
  }
  if (payload.tanggal_data_sama_dengan_terbit === false) {
    masalah.push('tanggal baris terakhir tidak sama dengan tanggal terbit berkas');
  }
  return masalah;
}

/**
 * Catat bila ini penerbitan BARU; lewati bila berkas yang sama sudah pernah dicatat
 * atau bukti hari ini sudah ada.
 *
 * Penerbitan baru tetap dicatat walau nilainya sama - yield pasar harian adalah
 * observasi baru, dan pengawas kebasian makro memakai tanggal bukti terakhir.
 * Catatan constraint DB: observed_date <= usable_from_date, jadi bukti dari berkas
 * yang baru kita baca hari ini dipakai mulai HARI INI (bukan surut ke tanggal pasar).
 */
export function decideEvidenceAction(input: {
  payload: RiskFreeCollectorPayload;
  latest: LatestEvidenceRingkas | null;
  todayIso: string;
}): KeputusanBukti {
  const { payload, latest, todayIso } = input;
  if (!latest) return { action: 'CATAT', reason: 'BUKTI_RESMI_PERTAMA' };
  if (latest.marketDate && latest.marketDate === payload.tanggal_data) {
    return { action: 'LEWATI', reason: 'PENERBITAN_INI_SUDAH_DICATAT' };
  }
  if (latest.usableFromDate === todayIso) {
    return { action: 'LEWATI', reason: 'BUKTI_HARI_INI_SUDAH_DICATAT' };
  }
  if (latest.marketDate && String(latest.marketDate) > String(payload.tanggal_data)) {
    return { action: 'LEWATI', reason: 'BUKTI_TERSIMPAN_LEBIH_BARU' };
  }
  if (latest.usableFromDate > todayIso) {
    return { action: 'LEWATI', reason: 'BUKTI_TERSIMPAN_BERTANGGAL_MASA_DEPAN' };
  }
  return { action: 'CATAT', reason: 'PENERBITAN_RESMI_BARU' };
}
