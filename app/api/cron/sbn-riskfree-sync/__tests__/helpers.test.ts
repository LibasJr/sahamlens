import { describe, expect, it } from 'vitest';
import {
  decideEvidenceAction,
  parseCollectorOutput,
  validatePayload,
  type RiskFreeCollectorPayload,
} from '../helpers';

const payload = (overrides: Partial<RiskFreeCollectorPayload> = {}): RiskFreeCollectorPayload => ({
  status: 'SUKSES',
  input_key: 'RISK_FREE_RATE_PCT',
  tenor: '10Y',
  seri: 'FR0108',
  tanggal_data: '2026-09-18',
  harga: 96.02,
  yield_pct: 7.08,
  sumber_nama: 'DJPPR Kementerian Keuangan - Daftar Kuotasi Harga SUN Seri Benchmark',
  sumber_judul: 'Daftar Kuotasi Harga SUN Seri Benchmark 2026',
  sumber_terbit: '2026-09-18',
  sumber_url: 'https://api-djppr.kemenkeu.go.id/web/api/v1/media/04A03BE3-9C49-457C-A7FC-27F64962572F',
  pdf_sha256: 'c53c45be108f6ba400cc5c43b3c287e6d55d86c51820e38fd26e40b522a425c2',
  baris_terbaca: 168,
  tanggal_data_sama_dengan_terbit: true,
  ...overrides,
});

describe('parseCollectorOutput', () => {
  it('menerima JSON sah yang diapit log lain', () => {
    const keluaran = parseCollectorOutput(`log pembuka\n${JSON.stringify(payload())}\n`);
    expect(keluaran.yield_pct).toBe(7.08);
  });

  it('melempar saat pengumpul melaporkan GAGAL', () => {
    expect(() => parseCollectorOutput(JSON.stringify({ status: 'GAGAL', reason: 'TABEL_TIDAK_TERBACA' }))).toThrow(/TABEL_TIDAK_TERBACA/);
  });

  it('melempar saat keluaran bukan JSON', () => {
    expect(() => parseCollectorOutput('tidak ada json di sini')).toThrow(/tidak berisi JSON/);
  });
});

describe('validatePayload', () => {
  it('meloloskan bukti resmi DJPPR yang wajar', () => {
    expect(validatePayload(payload(), '2026-09-25')).toEqual([]);
  });

  it('menolak sumber yang bukan berkas resmi DJPPR', () => {
    const masalah = validatePayload(payload({ sumber_url: 'https://example.com/yield.pdf' }), '2026-09-25');
    expect(masalah.join(' ')).toMatch(/bukan berkas resmi DJPPR/);
  });

  it('menolak tenor selain 10Y', () => {
    const masalah = validatePayload(payload({ tenor: '20Y', seri: 'FR0107' }), '2026-09-25');
    expect(masalah.join(' ')).toMatch(/tenor tak terduga/);
  });

  it('menolak bukti yang terlalu tua', () => {
    const masalah = validatePayload(payload({ tanggal_data: '2026-06-30' }), '2026-09-25');
    expect(masalah.join(' ')).toMatch(/terlalu tua/);
  });

  it('menolak tanggal di masa depan', () => {
    const masalah = validatePayload(payload({ tanggal_data: '2026-10-02' }), '2026-09-25');
    expect(masalah.join(' ')).toMatch(/masa depan/);
  });

  it('menolak sidik PDF yang tidak sah', () => {
    const masalah = validatePayload(payload({ pdf_sha256: 'bukan-hex' }), '2026-09-25');
    expect(masalah.join(' ')).toMatch(/sidik PDF/);
  });

  it('menolak tabel yang hanya terbaca sebagian', () => {
    const masalah = validatePayload(payload({ baris_terbaca: 4 }), '2026-09-25');
    expect(masalah.join(' ')).toMatch(/terlalu sedikit baris/);
  });

  it('menolak ketika baris terakhir bukan tanggal terbit berkas', () => {
    const masalah = validatePayload(payload({ tanggal_data_sama_dengan_terbit: false }), '2026-09-25');
    expect(masalah.join(' ')).toMatch(/tidak sama dengan tanggal terbit/);
  });
});

describe('decideEvidenceAction', () => {
  const hari = '2026-09-25';

  it('mencatat bila belum ada bukti sama sekali', () => {
    expect(decideEvidenceAction({ payload: payload(), latest: null, todayIso: hari })).toEqual({
      action: 'CATAT',
      reason: 'BUKTI_RESMI_PERTAMA',
    });
  });

  it('mencatat penerbitan resmi baru walau nilainya sama', () => {
    const keputusan = decideEvidenceAction({
      payload: payload({ tanggal_data: '2026-09-25', sumber_terbit: '2026-09-25' }),
      latest: { valuePct: 7.08, usableFromDate: '2026-09-18', marketDate: '2026-09-18', sourceUrl: null },
      todayIso: hari,
    });
    expect(keputusan).toEqual({ action: 'CATAT', reason: 'PENERBITAN_RESMI_BARU' });
  });

  it('melewati penerbitan yang tanggal pasarnya sudah tercatat', () => {
    const keputusan = decideEvidenceAction({
      payload: payload(),
      latest: { valuePct: 7.16, usableFromDate: '2026-09-25', marketDate: '2026-09-18', sourceUrl: null },
      todayIso: hari,
    });
    expect(keputusan.reason).toBe('PENERBITAN_INI_SUDAH_DICATAT');
  });

  it('melewati bila bukti hari ini sudah tercatat', () => {
    const keputusan = decideEvidenceAction({
      payload: payload({ tanggal_data: '2026-09-24', sumber_terbit: '2026-09-24' }),
      latest: { valuePct: 7.14, usableFromDate: '2026-09-25', marketDate: '2026-09-18', sourceUrl: null },
      todayIso: hari,
    });
    expect(keputusan.reason).toBe('BUKTI_HARI_INI_SUDAH_DICATAT');
  });

  it('melewati berkas yang lebih tua daripada bukti tersimpan', () => {
    const keputusan = decideEvidenceAction({
      payload: payload({ tanggal_data: '2026-09-11', sumber_terbit: '2026-09-11' }),
      latest: { valuePct: 7.08, usableFromDate: '2026-09-18', marketDate: '2026-09-18', sourceUrl: null },
      todayIso: hari,
    });
    expect(keputusan.reason).toBe('BUKTI_TERSIMPAN_LEBIH_BARU');
  });

  it('melewati bukti tersimpan yang bertanggal masa depan', () => {
    const keputusan = decideEvidenceAction({
      payload: payload({ tanggal_data: '2026-09-19', sumber_terbit: '2026-09-19' }),
      latest: { valuePct: 7.08, usableFromDate: '2026-10-01', marketDate: '2026-09-18', sourceUrl: null },
      todayIso: hari,
    });
    expect(keputusan.reason).toBe('BUKTI_TERSIMPAN_BERTANGGAL_MASA_DEPAN');
  });
});
