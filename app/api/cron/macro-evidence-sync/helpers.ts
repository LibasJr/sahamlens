/**
 * Helper murni rute /api/cron/macro-evidence-sync (ERP Damodaran + verifikasi sasaran inflasi BI).
 * Dipisah dari route.ts karena Next.js hanya mengizinkan metode HTTP + config diekspor di berkas rute.
 */
export interface ErpPayload {
  status: string;
  input_key: string;
  nilai_pct: number;
  kolom: string;
  edisi: string;
  tanggal_update: string;
  umur_hari: number;
  mature_erp_pct: number | null;
  country_risk_premium_pct: number | null;
  erp_cds_pct: number | null;
  sumber_nama: string;
  sumber_url: string;
  berkas_sha256: string;
  negara: string;
}

export interface InflationPayload {
  status: string;
  input_key: string;
  mid_pct: number;
  pita_pct: number;
  upper_pct: number;
  lower_pct: number;
  tahun: number | null;
  fingerprint: string;
  sumber_url: string;
  kutipan: string;
}

export interface EvidenceRingkas {
  valuePct: number;
  marketDate: string | null;
  usableFromDate: string | null;
  sourceUrl: string | null;
}

export type Aksi = 'CATAT' | 'LEWATI';

const HOST_DAMODARAN = 'pages.stern.nyu.edu';
const HOST_BI = 'bi.go.id';
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parseCollectorJson<T extends { status: string }>(stdout: string): T {
  const mulai = stdout.indexOf('{');
  const akhir = stdout.lastIndexOf('}');
  if (mulai < 0 || akhir <= mulai) throw new Error('keluaran pengumpul tidak berisi JSON');
  const parsed = JSON.parse(stdout.slice(mulai, akhir + 1)) as T & { reason?: string };
  if (parsed.status !== 'SUKSES') {
    throw new Error(`pengumpul melaporkan ${parsed.status}: ${parsed.reason ?? 'tanpa alasan'}`);
  }
  return parsed;
}

/** Hasil yang GAGAL tetapi bukan kesalahan kode (mis. halaman resmi tidak terjangkau). */
export function bacaStatusKasar(stdout: string): { status: string; reason?: string } {
  const mulai = stdout.indexOf('{');
  const akhir = stdout.lastIndexOf('}');
  if (mulai < 0 || akhir <= mulai) return { status: 'TIDAK_ADA_JSON' };
  try {
    const parsed = JSON.parse(stdout.slice(mulai, akhir + 1)) as { status?: string; reason?: string };
    return { status: parsed.status ?? 'TIDAK_ADA_STATUS', reason: parsed.reason };
  } catch {
    return { status: 'JSON_TIDAK_VALID' };
  }
}

export function validateErp(payload: ErpPayload, todayIso: string): string[] {
  const pelanggaran: string[] = [];
  if (payload.input_key !== 'EQUITY_RISK_PREMIUM_PCT') pelanggaran.push('input_key tidak sesuai');
  if (!Number.isFinite(payload.nilai_pct) || payload.nilai_pct < 1 || payload.nilai_pct > 25) {
    pelanggaran.push('nilai ERP di luar rentang wajar 1-25%');
  }
  if (payload.kolom !== 'Total Equity Risk Premium') pelanggaran.push('kolom bukan Total Equity Risk Premium');
  if (!ISO.test(payload.tanggal_update)) pelanggaran.push('tanggal_update bukan ISO');
  if (payload.tanggal_update > todayIso) pelanggaran.push('tanggal_update di masa depan');
  if (!Number.isFinite(payload.umur_hari) || payload.umur_hari < 0 || payload.umur_hari > 400) {
    pelanggaran.push('edisi dataset terlalu tua (>400 hari)');
  }
  if (!payload.sumber_url.includes(HOST_DAMODARAN)) pelanggaran.push('sumber bukan domain Damodaran/NYU');
  if (!/^[0-9a-f]{64}$/.test(payload.berkas_sha256)) pelanggaran.push('sha256 berkas tidak sah');
  if (typeof payload.sumber_nama !== 'string' || payload.sumber_nama.length < 8) pelanggaran.push('sumber_nama kosong');
  return pelanggaran;
}

export function validateInflation(payload: InflationPayload, todayIso: string): string[] {
  const pelanggaran: string[] = [];
  if (payload.input_key !== 'INFLATION_TARGET_MID_PCT') pelanggaran.push('input_key tidak sesuai');
  if (!Number.isFinite(payload.mid_pct) || payload.mid_pct < 0.5 || payload.mid_pct > 10) {
    pelanggaran.push('mid sasaran inflasi di luar rentang wajar');
  }
  if (!Number.isFinite(payload.pita_pct) || payload.pita_pct < 0.1 || payload.pita_pct > 3) {
    pelanggaran.push('pita sasaran inflasi di luar rentang wajar');
  }
  const selisih = Math.abs(payload.upper_pct - (payload.mid_pct + payload.pita_pct));
  if (selisih > 1e-6) pelanggaran.push('upper tidak sama dengan mid + pita');
  if (!payload.sumber_url.startsWith('https://www.bi.go.id/')) pelanggaran.push('sumber bukan domain resmi bi.go.id');
  if (typeof payload.kutipan !== 'string' || payload.kutipan.length < 40) pelanggaran.push('kutipan bukti terlalu pendek');
  if (payload.tahun != null && (payload.tahun < 2020 || payload.tahun > Number(todayIso.slice(0, 4)) + 2)) {
    pelanggaran.push('tahun sasaran tidak wajar');
  }
  return pelanggaran;
}

export function decideEvidence(payload: {
  marketDate: string;
  nilai: number;
  latest: EvidenceRingkas | null;
  todayIso: string;
}): { action: Aksi; reason: string } {
  const { latest, marketDate, nilai, todayIso } = payload;
  if (latest == null) return { action: 'CATAT', reason: 'BUKTI_RESMI_PERTAMA' };
  if (latest.marketDate === marketDate && Math.abs(latest.valuePct - nilai) < 5e-3) {
    return { action: 'LEWATI', reason: 'PENERBITAN_INI_SUDAH_DICATAT' };
  }
  if (latest.usableFromDate === todayIso) return { action: 'LEWATI', reason: 'BUKTI_HARI_INI_SUDAH_DICATAT' };
  if (latest.marketDate != null && latest.marketDate > marketDate) {
    return { action: 'LEWATI', reason: 'BUKTI_TERSIMPAN_LEBIH_BARU' };
  }
  return { action: 'CATAT', reason: 'PENERBITAN_RESMI_BARU' };
}

/** Sasaran inflasi hanya ditulis ulang bila angka resmi benar-benar berbeda. */
export function decideInflation(payload: {
  midPct: number;
  upperPct: number;
  latestMid: EvidenceRingkas | null;
  latestUpper: EvidenceRingkas | null;
  todayIso: string;
}): { action: Aksi; reason: string } {
  const { midPct, upperPct, latestMid, latestUpper, todayIso } = payload;
  if (latestMid == null || latestUpper == null) return { action: 'CATAT', reason: 'BUKTI_RESMI_PERTAMA' };
  const sama = Math.abs(latestMid.valuePct - midPct) < 1e-6 && Math.abs(latestUpper.valuePct - upperPct) < 1e-6;
  if (sama) return { action: 'LEWATI', reason: 'SASARAN_RESMI_TIDAK_BERUBAH' };
  if (latestMid.usableFromDate === todayIso) return { action: 'CATAT', reason: 'SASARAN_BERUBAH_HARI_INI' };
  return { action: 'CATAT', reason: 'SASARAN_RESMI_BERUBAH' };
}