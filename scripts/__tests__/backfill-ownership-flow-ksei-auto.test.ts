import { describe, expect, it } from 'vitest';
import {
  discoverArchiveEntries,
  filterArchiveEntries,
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
    });
  });
});
