import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Pencatatan health menyentuh pool Postgres; test ini soal penggabungan deret, bukan telemetri.
vi.mock('@/modules/observability/service/data-source-health.service', () => ({
  recordDataSourceHealth: vi.fn(async () => {}),
}));

import { applyIdxLq45EodPrimary, type IdxHistoryRow } from '../idx-lq45-history.service';

const TICKER = 'ASII.JK';

/** Tanggal N hari bursa ke belakang dari hari ini, cukup untuk lolos cutoff range 1y. */
function day(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

function yahooRow(date: string, close: number): IdxHistoryRow {
  return {
    Date: `${date}T09:00:00.000Z`,
    Open: close,
    High: close,
    Low: close,
    Close: close,
    Volume: 1_000_000,
    AdjClose: close,
  };
}

function artifactRow(date: string, close: number) {
  return {
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 2_000_000,
    foreignBuy: 1_000,
    foreignSell: 500,
  };
}

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lq45-artifact-'));
  process.env.IDX_LQ45_EOD_PRIMARY_ENABLED = 'true';
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  delete process.env.IDX_LQ45_EOD_PRIMARY_ENABLED;
});

function writeArtifact(code: string, rows: ReturnType<typeof artifactRow>[]): void {
  fs.writeFileSync(
    path.join(dataDir, `${code}.json`),
    JSON.stringify({ ticker: code, source: 'IDX_OFFICIAL_API', updatedAt: new Date().toISOString(), history: rows }),
  );
}

describe('applyIdxLq45EodPrimary', () => {
  it('memakai Yahoo sebagai tulang punggung kalender dan menimpa OHLCV dengan angka IDX', async () => {
    const yahoo = [
      yahooRow(day(4), 100),
      yahooRow(day(3), 101),
      yahooRow(day(2), 102),
      yahooRow(day(1), 103),
    ];
    // Artefak hanya memuat dua sesi - lebih pendek daripada deret Yahoo.
    writeArtifact('ASII', [artifactRow(day(3), 901), artifactRow(day(2), 902)]);

    const result = await applyIdxLq45EodPrimary(TICKER, '1y', yahoo, { dataDir });

    // Rentangnya TIDAK boleh menyusut mengikuti panjang artefak.
    expect(result.history).toHaveLength(4);
    expect(result.applied).toBe(true);
    expect(result.source).toBe('IDX_TRADING_INFO_SS');
    expect(result.overlapRows).toBe(2);

    const byDate = new Map(result.history.map((row) => [row.Date.slice(0, 10), row]));
    expect(byDate.get(day(3))?.Close).toBe(901);
    expect(byDate.get(day(2))?.Close).toBe(902);
    // Baris tanpa padanan di IDX tetap memakai angka Yahoo.
    expect(byDate.get(day(4))?.Close).toBe(100);
    // AdjClose Yahoo ikut terbawa ke baris yang ditimpa IDX.
    expect(byDate.get(day(3))?.AdjClose).toBe(101);
  });

  it('tidak menghilangkan sesi terbaru saat artefak IDX tertinggal', async () => {
    const yahoo = [yahooRow(day(3), 100), yahooRow(day(2), 101), yahooRow(day(1), 777)];
    // Artefak berhenti dua sesi di belakang - kondisi normal selama sesi berjalan,
    // karena sinkronisasi baru menulis setelah penutupan.
    writeArtifact('ASII', [artifactRow(day(3), 901)]);

    const result = await applyIdxLq45EodPrimary(TICKER, '1y', yahoo, { dataDir });

    const last = result.history.at(-1);
    expect(last?.Date.slice(0, 10)).toBe(day(1));
    expect(last?.Close).toBe(777);
    // _meta harus melaporkan baris terakhir yang benar-benar dikirim, bukan tanggal IDX.
    expect(result.latestTradeDate).toBe(day(1));
    expect(result.latestClose).toBe(777);
  });

  it('melaporkan YAHOO_ONLY saat flag mati, tanpa mengubah deret Yahoo', async () => {
    delete process.env.IDX_LQ45_EOD_PRIMARY_ENABLED;
    const yahoo = [yahooRow(day(2), 100), yahooRow(day(1), 101)];
    writeArtifact('ASII', [artifactRow(day(1), 901)]);

    const result = await applyIdxLq45EodPrimary(TICKER, '1y', yahoo, { dataDir });

    expect(result.applied).toBe(false);
    expect(result.source).toBe('YAHOO_CHART');
    expect(result.latestCloseReconciliation).toBe('YAHOO_ONLY');
    expect(result.history).toEqual(yahoo);
  });

  it('tidak menyentuh emiten di luar universe LQ45', async () => {
    const yahoo = [yahooRow(day(1), 100)];
    writeArtifact('ZZZZ', [artifactRow(day(1), 901)]);

    const result = await applyIdxLq45EodPrimary('ZZZZ.JK', '1y', yahoo, { dataDir });

    expect(result.applied).toBe(false);
    expect(result.source).toBe('YAHOO_CHART');
  });
});
