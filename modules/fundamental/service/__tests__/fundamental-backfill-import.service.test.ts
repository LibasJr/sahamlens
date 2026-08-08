import { describe, expect, it, vi } from 'vitest';
import {
  buildFundamentalBackfillInsert,
  parseFundamentalBackfillRows,
  runFundamentalBackfillImport,
} from '../fundamental-backfill-import.service';

// period_end WAJIB - importir ini khusus snapshot point-in-time, dan tanpa akhir
// periode baris tidak punya arti historis. Fixture di bawah karena itu selalu
// menyertakannya; CSV tanpa kolom tersebut memang ditolak (diuji terpisah).
const CSV = [
  'Kode,observed_date,period_end,PER,PBV,ROE,DER,current_ratio,revenue_growth,source',
  'BBCA,2026-01-31,2025-12-31,22.1,4.3,18.5,0.2,1.4,8.0,IDX',
  'BBRI,2026-01-31,2025-12-31,12.4,2.1,15.2,5.8,,6.5,IDX',
  'TPIA,2026-01-31,2025-12-31,,,,,,,IDX',
].join('\n');

describe('fundamental-backfill-import.service', () => {
  it('parseFundamentalBackfillRows melewati placeholder kosong hanya jika diminta eksplisit', () => {
    const parsed = parseFundamentalBackfillRows(CSV, {
      skipEmptyRows: true,
      percentInput: 'percent',
      maxObservedDate: '2026-08-06',
      source: 'admin-test',
    });

    expect(parsed.rawRows).toBe(3);
    expect(parsed.skippedEmptyRows).toBe(1);
    expect(parsed.rows.map((row) => row.ticker)).toEqual(['BBCA.JK', 'BBRI.JK']);
    expect(parsed.rows[1].currentRatio).toBeNull();
  });

  it('placeholder kosong tanpa skipEmptyRows tetap fail-closed', () => {
    expect(() => parseFundamentalBackfillRows(CSV, {
      skipEmptyRows: false,
      percentInput: 'percent',
      maxObservedDate: '2026-08-06',
      source: 'admin-test',
    })).toThrow(/minimal satu metrik/);
  });

  it('decimal mode mengubah rasio ROE dan revenueGrowth menjadi persen', () => {
    const parsed = parseFundamentalBackfillRows(
      [
        'Kode,observed_date,period_end,PER,PBV,ROE,DER,current_ratio,revenue_growth,source',
        'TLKM,2026-01-31,2025-12-31,14.2,2.0,0.16,0.6,1.1,0.052,IDX',
      ].join('\n'),
      {
        skipEmptyRows: false,
        percentInput: 'decimal',
        maxObservedDate: '2026-08-06',
        source: 'admin-test',
      }
    );

    expect(parsed.rows[0].roe).toBe(16);
    expect(parsed.rows[0].revenueGrowth).toBe(5.2);
  });

  it('buildFundamentalBackfillInsert append-only dan tidak menimpa snapshot lama', () => {
    const parsed = parseFundamentalBackfillRows(CSV, {
      skipEmptyRows: true,
      percentInput: 'percent',
      maxObservedDate: '2026-08-06',
      source: 'admin-test',
    });
    const query = buildFundamentalBackfillInsert(parsed.rows);

    expect(query).not.toBeNull();
    expect(query!.text.replace(/\s+/g, ' ')).toContain('ON CONFLICT (ticker, observed_date) DO NOTHING');
    expect(query!.text).not.toContain('DO UPDATE');
    expect(query!.params).toContain('BBCA.JK');
    expect(query!.params).toContain('BBRI.JK');
  });

  // REGRESI: period_end pernah dibuang diam-diam oleh jalur impor admin.
  //
  // Parser tidak mengenal kolom itu dan INSERT tidak menyertakannya, jadi CSV
  // point-in-time yang benar masuk sebagai period_end NULL - berhenti terhitung sebagai
  // snapshot PIT. Karena kuncinya (ticker, observed_date) dan insert-nya DO NOTHING,
  // baris cacat itu juga MENGUNCI slotnya: baris PIT yang benar tidak akan pernah bisa
  // masuk lagi. Sekarang kolomnya wajib, dan test di bawah menjaga ketiga sifat itu:
  // ikut terparse, ikut ke SQL, dan ditolak kalau hilang atau melewati observed_date.
  describe('period_end wajib dan tidak boleh dibuang diam-diam', () => {
    const PIT_CSV = [
      'ticker,observed_date,period_end,per,pbv,roe,der,current_ratio,revenue_growth,source',
      'ANTM,2025-04-09,2024-12-31,9.72,1.13,11.59,0.39,1.84,68.57,ipotnews',
    ].join('\n');

    it('kolom period_end ikut terparse dan masuk ke SQL INSERT', () => {
      const parsed = parseFundamentalBackfillRows(PIT_CSV, {
        skipEmptyRows: true, percentInput: 'percent', maxObservedDate: '2026-08-06', source: 'admin-test',
      });

      expect(parsed.rows[0].periodEnd).toBe('2024-12-31');
      const query = buildFundamentalBackfillInsert(parsed.rows)!;
      expect(query.text.replace(/\s+/g, ' ')).toContain('(ticker, observed_date, period_end,');
      expect(query.params).toContain('2024-12-31');
    });

    it('period_end melewati observed_date ditolak, bukan disimpan terbalik', () => {
      const bad = [
        'ticker,observed_date,period_end,per,source',
        'ANTM,2025-01-05,2025-03-31,9.72,ipotnews',
      ].join('\n');

      expect(() => parseFundamentalBackfillRows(bad, {
        skipEmptyRows: true, percentInput: 'percent', maxObservedDate: '2026-08-06', source: 'admin-test',
      })).toThrow(/period_end 2025-03-31 tidak boleh sesudah observed_date 2025-01-05/);
    });

    it('CSV tanpa kolom period_end ditolak, bukan disimpan sebagai NULL', () => {
      const tanpaPeriodEnd = [
        'ticker,observed_date,per,source',
        'ANTM,2025-04-09,9.72,ipotnews',
      ].join('\n');

      expect(() => parseFundamentalBackfillRows(tanpaPeriodEnd, {
        skipEmptyRows: true, percentInput: 'percent', maxObservedDate: '2026-08-06', source: 'admin-test',
      })).toThrow(/period_end/);
    });
  });

  it('runFundamentalBackfillImport dry-run tidak menyentuh database', async () => {
    const pool = { query: vi.fn() };
    const ensureSchema = vi.fn();
    const result = await runFundamentalBackfillImport(
      { csvText: CSV, dryRun: true, skipEmptyRows: true, percentInput: 'percent', maxObservedDate: '2026-08-06' },
      { pool, ensureSchema }
    );

    expect(result).toMatchObject({
      mode: 'DRY_RUN',
      rawRows: 3,
      parsedRows: 2,
      skippedEmptyRows: 1,
      insertedRows: 0,
      skippedExistingRows: null,
      tickers: 2,
    });
    expect(pool.query).not.toHaveBeenCalled();
    expect(ensureSchema).not.toHaveBeenCalled();
  });

  it('runFundamentalBackfillImport insert memakai schema dan melaporkan existing rows', async () => {
    const pool = { query: vi.fn(async () => ({ rowCount: 1 })) };
    const ensureSchema = vi.fn(async () => {});
    const result = await runFundamentalBackfillImport(
      { csvText: CSV, dryRun: false, skipEmptyRows: true, percentInput: 'percent', maxObservedDate: '2026-08-06' },
      { pool, ensureSchema }
    );

    expect(result).toMatchObject({
      mode: 'INSERT_APPEND_ONLY',
      parsedRows: 2,
      insertedRows: 1,
      skippedExistingRows: 1,
    });
    expect(ensureSchema).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
