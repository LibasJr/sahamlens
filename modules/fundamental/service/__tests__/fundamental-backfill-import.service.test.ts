import { describe, expect, it, vi } from 'vitest';
import {
  buildFundamentalBackfillInsert,
  parseFundamentalBackfillRows,
  runFundamentalBackfillImport,
} from '../fundamental-backfill-import.service';

// period_end WAJIB sejak PIT v2 (lihat assertDateKey di fundamental-backfill-import.service.ts).
// Fixture ini sempat tertinggal di format lama tanpa kolom tersebut, sehingga SELURUH test di
// file ini gagal dengan "Baris 2 period_end harus format YYYY-MM-DD" - bukan karena parsernya
// rusak, tapi karena CSV-nya yang usang. Nilainya harus <= observed_date: laporan Q4 2025
// (period_end 2025-12-31) yang baru dipublikasikan 2026-01-31 (observed_date).
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

  // Aturan period_end sendiri sebelumnya TIDAK punya satu pun test. Perubahannya (jadi wajib)
  // masuk lewat commit 38ea52b dan langsung membuat file ini merah tanpa ada yang menyadari,
  // karena gerbang CI sedang mati. Tiga test di bawah mengunci kontraknya.
  it('CSV tanpa kolom period_end ditolak, bukan diterima diam-diam', () => {
    expect(() => parseFundamentalBackfillRows(
      [
        'Kode,observed_date,PER,PBV,ROE,DER,current_ratio,revenue_growth,source',
        'BBCA,2026-01-31,22.1,4.3,18.5,0.2,1.4,8.0,IDX',
      ].join('\n'),
      { skipEmptyRows: false, percentInput: 'percent', maxObservedDate: '2026-08-06', source: 'admin-test' },
    )).toThrow(/period_end/);
  });

  it('period_end sesudah observed_date ditolak - laporan tidak boleh dipakai sebelum terbit', () => {
    expect(() => parseFundamentalBackfillRows(
      [
        'Kode,observed_date,period_end,PER,PBV,ROE,DER,current_ratio,revenue_growth,source',
        'BBCA,2026-01-31,2026-03-31,22.1,4.3,18.5,0.2,1.4,8.0,IDX',
      ].join('\n'),
      { skipEmptyRows: false, percentInput: 'percent', maxObservedDate: '2026-08-06', source: 'admin-test' },
    )).toThrow(/tidak boleh sesudah observed_date/);
  });

  it('period_end ikut terbawa ke baris hasil parse', () => {
    const parsed = parseFundamentalBackfillRows(CSV, {
      skipEmptyRows: true, percentInput: 'percent', maxObservedDate: '2026-08-06', source: 'admin-test',
    });

    expect(parsed.rows[0].periodEnd).toBe('2025-12-31');
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

  // Test lama berhenti di "ada ON CONFLICT" dan "params memuat ticker", lalu mem-mock
  // pool.query - jadi SQL yang dihasilkan tidak pernah benar-benar diperiksa. Akibatnya
  // placeholder yang kehilangan tanda `$` dan jumlah nilai yang kurang satu lolos ke
  // production, dan tombol Import gagal total padahal seluruh test hijau.
  it('setiap tuple memakai placeholder $n, bukan bilangan literal', () => {
    const parsed = parseFundamentalBackfillRows(CSV, {
      skipEmptyRows: true, percentInput: 'percent', maxObservedDate: '2026-08-06', source: 'admin-test',
    });
    const query = buildFundamentalBackfillInsert(parsed.rows)!;

    expect(query.text).toContain('($1, $2::date, $3::date,');
    // `(1, 2::date` = bentuk rusak yang lolos sebelumnya.
    expect(query.text).not.toMatch(/\(\s*\d+\s*,\s*\d+::date/);
  });

  it('jumlah placeholder sama persis dengan jumlah params', () => {
    const parsed = parseFundamentalBackfillRows(CSV, {
      skipEmptyRows: true, percentInput: 'percent', maxObservedDate: '2026-08-06', source: 'admin-test',
    });
    const query = buildFundamentalBackfillInsert(parsed.rows)!;

    const placeholders = new Set(query.text.match(/\$\d+/g) ?? []);
    expect(placeholders.size).toBe(query.params.length);
    // 2 baris x 10 kolom. Kalau period_end hilang lagi dari params, angkanya jadi 18.
    expect(query.params.length).toBe(20);
  });

  it('period_end ikut terkirim ke database, bukan divalidasi lalu dibuang', () => {
    const parsed = parseFundamentalBackfillRows(CSV, {
      skipEmptyRows: true, percentInput: 'percent', maxObservedDate: '2026-08-06', source: 'admin-test',
    });
    const query = buildFundamentalBackfillInsert(parsed.rows)!;

    // Posisi ke-3 tiap tuple = period_end, sejajar dengan daftar kolom di INSERT.
    expect(query.params[2]).toBe('2025-12-31');
    expect(query.params[12]).toBe('2025-12-31');
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
