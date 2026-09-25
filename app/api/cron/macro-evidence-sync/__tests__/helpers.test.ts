import { describe, expect, it } from 'vitest';
import {
  decideEvidence,
  decideInflation,
  parseCollectorJson,
  validateErp,
  validateInflation,
  type ErpPayload,
  type InflationPayload,
} from '../helpers';

const TODAY = '2026-09-25';

const erp = (over: Partial<ErpPayload> = {}): ErpPayload => ({
  status: 'SUKSES',
  input_key: 'EQUITY_RISK_PREMIUM_PCT',
  nilai_pct: 6.5565,
  kolom: 'Total Equity Risk Premium',
  edisi: 'ctrypremJuly26.xlsx',
  tanggal_update: '2026-07-01',
  umur_hari: 86,
  mature_erp_pct: 4.2,
  country_risk_premium_pct: 2.36,
  erp_cds_pct: 6.22,
  sumber_nama: 'Aswath Damodaran (NYU Stern) - Country Risk Premiums',
  sumber_url: 'https://pages.stern.nyu.edu/~adamodar/pc/datasets/ctrypremJuly26.xlsx',
  berkas_sha256: 'a'.repeat(64),
  negara: 'Indonesia',
  ...over,
});

const inflasi = (over: Partial<InflationPayload> = {}): InflationPayload => ({
  status: 'SUKSES',
  input_key: 'INFLATION_TARGET_MID_PCT',
  mid_pct: 2.5,
  pita_pct: 1,
  upper_pct: 3.5,
  lower_pct: 1.5,
  tahun: 2026,
  fingerprint: 'safari18_0',
  sumber_url: 'https://www.bi.go.id/id/publikasi/ruang-media/news-release/Pages/sp_282226.aspx',
  kutipan: 'sasaran 2,5\u00b11% pada 2026 (High Level Meeting TPIP)',
  ...over,
});

describe('parseCollectorJson', () => {
  it('mengurai JSON yang diapit log lain', () => {
    const hasil = parseCollectorJson<{ status: string }>(`log awal\n{"status":"SUKSES"}\ntrailing`);
    expect(hasil.status).toBe('SUKSES');
  });
  it('melempar saat status bukan SUKSUS', () => {
    expect(() => parseCollectorJson('{"status":"GAGAL","reason":"SUMBER_RESMI_TIDAK_TERBACA"}')).toThrow(/SUMBER_RESMI_TIDAK_TERBACA/);
  });
  it('melempar saat tidak ada JSON', () => {
    expect(() => parseCollectorJson('tidak ada json')).toThrow(/tidak berisi JSON/);
  });
});

describe('validateErp', () => {
  it('lolos untuk payload yang sah', () => {
    expect(validateErp(erp(), TODAY)).toEqual([]);
  });
  it('menolak nilai di luar rentang dan sumber bukan Damodaran', () => {
    const pelanggaran = validateErp(erp({ nilai_pct: 0.2, sumber_url: 'https://contoh.com/x.xlsx' }), TODAY);
    expect(pelanggaran.join(' ')).toMatch(/rentang wajar/);
    expect(pelanggaran.join(' ')).toMatch(/Damodaran/);
  });
  it('menolak edisi terlalu tua dan tanggal masa depan', () => {
    expect(validateErp(erp({ umur_hari: 401 }), TODAY).join(' ')).toMatch(/terlalu tua/);
    expect(validateErp(erp({ tanggal_update: '2026-10-01', umur_hari: 0 }), TODAY).join(' ')).toMatch(/masa depan/);
  });
  it('menolak kolom yang bukan Total Equity Risk Premium dan sha tidak sah', () => {
    const pelanggaran = validateErp(erp({ kolom: 'Country Risk Premium', berkas_sha256: 'xyz' }), TODAY);
    expect(pelanggaran.join(' ')).toMatch(/kolom bukan/);
    expect(pelanggaran.join(' ')).toMatch(/sha256/);
  });
});

describe('validateInflation', () => {
  it('lolos untuk payload yang sah', () => {
    expect(validateInflation(inflasi(), TODAY)).toEqual([]);
  });
  it('menolak sumber bukan bi.go.id dan kutipan pendek', () => {
    const pelanggaran = validateInflation(inflasi({ sumber_url: 'https://contoh.com/x', kutipan: 'pendek' }), TODAY);
    expect(pelanggaran.join(' ')).toMatch(/bi.go.id/);
    expect(pelanggaran.join(' ')).toMatch(/kutipan/);
  });
  it('menolak upper yang tidak sama dengan mid + pita', () => {
    expect(validateInflation(inflasi({ upper_pct: 9 }), TODAY).join(' ')).toMatch(/upper tidak sama/);
  });
});

describe('decideEvidence', () => {
  it('mencatat saat belum ada bukti', () => {
    expect(decideEvidence({ marketDate: '2026-07-01', nilai: 6.5565, latest: null, todayIso: TODAY }).action).toBe('CATAT');
  });
  it('melewatkan penerbitan yang sama', () => {
    const hasil = decideEvidence({
      marketDate: '2026-07-01',
      nilai: 6.5565,
      latest: { valuePct: 6.5565, marketDate: '2026-07-01', usableFromDate: '2026-08-01', sourceUrl: null },
      todayIso: TODAY,
    });
    expect(hasil.action).toBe('LEWATI');
    expect(hasil.reason).toBe('PENERBITAN_INI_SUDAH_DICATAT');
  });
  it('mencatat edisi baru dan melewatkan edisi lebih tua', () => {
    const terbaru = { valuePct: 6.5565, marketDate: '2026-07-01', usableFromDate: '2026-08-01', sourceUrl: null };
    expect(decideEvidence({ marketDate: '2027-01-05', nilai: 6.1, latest: terbaru, todayIso: TODAY }).action).toBe('CATAT');
    expect(decideEvidence({ marketDate: '2026-01-05', nilai: 6.69, latest: terbaru, todayIso: TODAY }).action).toBe('LEWATI');
  });
});

describe('decideInflation', () => {
  const latestMid = { valuePct: 2.5, marketDate: '2026-01-29', usableFromDate: '2026-01-30', sourceUrl: null };
  const latestUpper = { valuePct: 3.5, marketDate: '2026-01-29', usableFromDate: '2026-01-30', sourceUrl: null };
  it('melewatkan saat angka resmi tidak berubah', () => {
    const hasil = decideInflation({ midPct: 2.5, upperPct: 3.5, latestMid, latestUpper, todayIso: TODAY });
    expect(hasil.action).toBe('LEWATI');
    expect(hasil.reason).toBe('SASARAN_RESMI_TIDAK_BERUBAH');
  });
  it('mencatat saat sasaran resmi berubah', () => {
    const hasil = decideInflation({ midPct: 2.0, upperPct: 3.0, latestMid, latestUpper, todayIso: TODAY });
    expect(hasil.action).toBe('CATAT');
    expect(hasil.reason).toBe('SASARAN_RESMI_BERUBAH');
  });
  it('mencatat saat salah satu bukti belum ada', () => {
    expect(decideInflation({ midPct: 2.5, upperPct: 3.5, latestMid: null, latestUpper, todayIso: TODAY }).action).toBe('CATAT');
  });
});