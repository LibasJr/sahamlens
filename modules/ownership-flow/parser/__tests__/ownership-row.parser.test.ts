import { describe, expect, it } from 'vitest';
import {
  normalizeObservedDate,
  normalizeOwnershipTicker,
  parseOwnershipRow,
  type ParseContext,
} from '../ownership-row.parser';

const CONTEXT: ParseContext = {
  source: 'KSEI_REGISTERED_SECURITY',
  sourceUrl: 'https://web.ksei.co.id/services/registered-securities/shares/lc/BBRI',
  // Pengambilan terjadi 16 Agustus - satu hari SETELAH tanggal observasi di bawah.
  fetchedAt: '2026-08-16T01:30:00.000Z',
};

describe('normalizeOwnershipTicker', () => {
  it('menambahkan sufiks .JK', () => {
    expect(normalizeOwnershipTicker('BBRI')).toBe('BBRI.JK');
  });

  it('mempertahankan ticker yang sudah bersufiks', () => {
    expect(normalizeOwnershipTicker('BBRI.JK')).toBe('BBRI.JK');
  });

  it('menormalkan huruf kecil dan spasi', () => {
    expect(normalizeOwnershipTicker(' bbri ')).toBe('BBRI.JK');
  });

  it('menolak nilai tidak sah', () => {
    expect(normalizeOwnershipTicker('')).toBeNull();
    expect(normalizeOwnershipTicker('BB RI!')).toBeNull();
    expect(normalizeOwnershipTicker(null)).toBeNull();
    expect(normalizeOwnershipTicker('TERLALUPANJANGSEKALI')).toBeNull();
  });
});

describe('normalizeObservedDate', () => {
  it('menerima YYYY-MM-DD', () => {
    expect(normalizeObservedDate('2026-08-15')).toBe('2026-08-15');
  });

  it('menerima nama bulan Inggris & Indonesia', () => {
    expect(normalizeObservedDate('15 Aug 2026')).toBe('2026-08-15');
    expect(normalizeObservedDate('15 Agustus 2026')).toBe('2026-08-15');
    expect(normalizeObservedDate('15-Aug-2026')).toBe('2026-08-15');
    expect(normalizeObservedDate('1 Des 2026')).toBe('2026-12-01');
  });

  it('MENOLAK format numerik ambigu', () => {
    // "01/02/2026" bisa berarti 1 Februari atau 2 Januari. Menebak salah satunya
    // akan menggeser seluruh histori PIT tanpa gejala apa pun.
    expect(normalizeObservedDate('01/02/2026')).toBeNull();
    expect(normalizeObservedDate('1-2-2026')).toBeNull();
  });

  it('menolak tanggal yang tidak ada di kalender', () => {
    expect(normalizeObservedDate('2026-02-31')).toBeNull();
    expect(normalizeObservedDate('2026-13-01')).toBeNull();
  });
});

describe('parseOwnershipRow - baris sah', () => {
  it('menerima baris lengkap dan MEMPERTAHANKAN observedDate dari sumber', () => {
    const result = parseOwnershipRow(
      {
        ticker: 'BBRI',
        observedDate: '15 Aug 2026',
        localPct: '57,25',
        foreignPct: '42,75',
        scriplessPct: '99,80',
        totalSecurities: '151.559.001.604',
      },
      CONTEXT
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { observation } = result;

    expect(observation.ticker).toBe('BBRI.JK');
    // INTI §6: observed_date berasal dari sumber (15 Agu), fetched_at dari server
    // (16 Agu). Keduanya TIDAK BOLEH sama.
    expect(observation.observedDate).toBe('2026-08-15');
    expect(observation.fetchedAt).toBe('2026-08-16T01:30:00.000Z');
    expect(observation.observedDate).not.toBe(observation.fetchedAt.slice(0, 10));

    expect(observation.foreignPct).toBe(42.75);
    expect(observation.localPct).toBe(57.25);
    expect(observation.totalSecurities).toBe(151559001604);
    expect(observation.quality).toBe('VALID');
    expect(observation.source).toBe('KSEI_REGISTERED_SECURITY');
  });

  it('menerima baris yang hanya punya foreign percentage', () => {
    const result = parseOwnershipRow(
      { ticker: 'TLKM', observedDate: '2026-08-15', foreignPct: '30.10', localPct: '-' },
      CONTEXT
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observation.foreignPct).toBe(30.1);
    // Kolom yang tidak disediakan sumber tetap null - bukan 0.
    expect(result.observation.localPct).toBeNull();
  });
});

describe('parseOwnershipRow - baris ditolak', () => {
  it('menolak persentase di luar 0-100 (tanpa clamp)', () => {
    const result = parseOwnershipRow(
      { ticker: 'BBRI', observedDate: '2026-08-15', foreignPct: '145%' },
      CONTEXT
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected.quality).toBe('INCONSISTENT');
    expect(result.rejected.reason).toContain('0-100');
  });

  it('menolak ketika local + foreign menyimpang jauh dari 100', () => {
    const result = parseOwnershipRow(
      { ticker: 'BBRI', observedDate: '2026-08-15', localPct: '60', foreignPct: '60' },
      CONTEXT
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected.quality).toBe('INCONSISTENT');
  });

  it('menoleransi selisih pembulatan kecil', () => {
    const result = parseOwnershipRow(
      { ticker: 'BBRI', observedDate: '2026-08-15', localPct: '57.26', foreignPct: '42.75' },
      CONTEXT
    );
    expect(result.ok).toBe(true);
  });

  it('menolak baris tanpa persentase sama sekali', () => {
    const result = parseOwnershipRow(
      { ticker: 'BBRI', observedDate: '2026-08-15', localPct: '-', foreignPct: 'N/A' },
      CONTEXT
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected.quality).toBe('MISSING');
  });

  it('menolak tanggal observasi yang tidak terbaca', () => {
    const result = parseOwnershipRow(
      { ticker: 'BBRI', observedDate: '01/02/2026', foreignPct: '42.75' },
      CONTEXT
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected.quality).toBe('MISSING');
  });

  it('menolak observedDate di masa depan', () => {
    // Kalau lolos, baris ini akan terus menang sebagai "observasi terbaru"
    // selama berhari-hari dan meracuni seluruh as-of lookup.
    const result = parseOwnershipRow(
      { ticker: 'BBRI', observedDate: '2027-01-01', foreignPct: '42.75' },
      CONTEXT
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected.quality).toBe('INCONSISTENT');
  });

  it('menolak ticker yang tidak dikenali', () => {
    const result = parseOwnershipRow({ ticker: '???', observedDate: '2026-08-15', foreignPct: '10' }, CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejected.ticker).toBeNull();
  });
});
