import { describe, expect, it } from 'vitest';
import {
  assessDryRunSummary,
  buildMonthlyProbeCandidates,
  discoverArchiveEntries,
  filterArchiveEntries,
  mergeArchiveEntries,
  parseBackfillSummary,
} from '../backfill-ownership-flow-ksei-auto.mjs';

describe('auto backfill Ownership Flow KSEI', () => {
  it('menemukan dan mengurutkan hanya nama arsip BalanceposEfek dengan tanggal sah', () => {
    const html = `
      <a href="/Download/BalanceposEfek20260731.zip">31 Juli</a>
      <a href="/Download/BalanceposEfek20260630.zip">30 Juni</a>
      <a href="/Download/BalanceposEfek20260529.zip">29 Mei</a>
      <a href="/Download/BalanceposEfek20261399.zip">tanggal rusak</a>
      <a href="https://example.com/not-ksei.zip">bukan arsip</a>
    `;

    expect(discoverArchiveEntries(html).map((x) => x.observedDate)).toEqual([
      '2026-05-29',
      '2026-06-30',
      '2026-07-31',
    ]);
  });

  it('memfilter range berdasarkan tanggal snapshot aktual, bukan asumsi akhir bulan', () => {
    const entries = discoverArchiveEntries(`
      BalanceposEfek20260130.zip
      BalanceposEfek20260227.zip
      BalanceposEfek20260331.zip
      BalanceposEfek20260430.zip
      BalanceposEfek20260529.zip
    `);

    expect(
      filterArchiveEntries(entries, { from: '2026-02-01', to: '2026-04-30' })
        .map((x) => x.observedDate),
    ).toEqual(['2026-02-27', '2026-03-31', '2026-04-30']);
  });



  it('membangun kandidat probe dari akhir bulan mundur tanpa keluar range', () => {
    const groups = buildMonthlyProbeCandidates(
      { from: '2025-01-01', to: '2025-02-28' },
      3,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ month: '2025-01' });
    expect(groups[0].candidates.map((x) => x.observedDate)).toEqual([
      '2025-01-31',
      '2025-01-30',
      '2025-01-29',
    ]);
    expect(groups[1].candidates.map((x) => x.observedDate)).toEqual([
      '2025-02-28',
      '2025-02-27',
      '2025-02-26',
    ]);
    expect(groups[0].candidates[0]).toMatchObject({
      fileName: 'BalanceposEfek20250131.zip',
      discovery: 'endpoint-probe',
    });
  });

  it('menggabungkan hasil archive page dan probe tanpa menduplikasi tanggal', () => {
    const page = discoverArchiveEntries('BalanceposEfek20250131.zip');
    const probe = buildMonthlyProbeCandidates(
      { from: '2025-01-01', to: '2025-02-28' },
      1,
    ).flatMap((group) => group.candidates);

    const merged = mergeArchiveEntries(page, probe);
    expect(merged.map((x) => [x.observedDate, x.discovery])).toEqual([
      ['2025-01-31', 'archive-page'],
      ['2025-02-28', 'endpoint-probe'],
    ]);
  });

  it('membaca gate dry-run dan hasil idempotent dari output parser utama', () => {
    const summary = parseBackfillSummary(`
      Baris EQUITY valid : 1007
      Baris ditolak      : 0
      Tanggal snapshot   : 2026-07-31
      Selesai. Baris BARU: 0. Sudah ada sebelumnya: 1007.
    `);

    expect(summary).toEqual({
      validEquity: 1007,
      rejected: 0,
      snapshotDate: '2026-07-31',
      inserted: 0,
      alreadyExisting: 1007,
      quarantined: null,
    });
  });

  it('menandai reject sebagai PARTIAL tetapi tidak mengubahnya menjadi error tanggal/coverage', () => {
    const entry = discoverArchiveEntries('BalanceposEfek20250528.zip')[0];
    const assessment = assessDryRunSummary({
      validEquity: 990,
      rejected: 2,
      snapshotDate: '2025-05-28',
      inserted: null,
      alreadyExisting: null,
      quarantined: null,
    }, entry, 100);
    expect(assessment).toEqual({ status: 'PARTIAL', errors: [] });
  });

  it('tetap ERROR bila tanggal snapshot tidak cocok walaupun row valid banyak', () => {
    const entry = discoverArchiveEntries('BalanceposEfek20250528.zip')[0];
    const assessment = assessDryRunSummary({
      validEquity: 990,
      rejected: 0,
      snapshotDate: '2025-05-29',
      inserted: null,
      alreadyExisting: null,
      quarantined: null,
    }, entry, 100);
    expect(assessment.status).toBe('ERROR');
    expect(assessment.errors.join(' ')).toContain('tanggal file');
  });

});
