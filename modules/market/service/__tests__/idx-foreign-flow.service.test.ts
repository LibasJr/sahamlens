import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getRealForeignFlow,
  calculateAccumulationStreak,
  getForeignParticipationRatio,
  summarizeForeignFlow,
  type IdxForeignFlowPoint,
} from '../idx-foreign-flow.service';

let dataDir: string;

function point(
  date: string,
  close: number,
  volume: number,
  foreignBuy: number,
  foreignSell: number
): IdxForeignFlowPoint {
  const netForeignVolume = foreignBuy - foreignSell;
  return {
    date,
    close,
    volume,
    foreignBuy,
    foreignSell,
    netForeignVolume,
    netForeignValueBillion: (netForeignVolume * close) / 1_000_000_000,
  };
}

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idx-flow-test-'));
  fs.writeFileSync(
    path.join(dataDir, 'BBCA.json'),
    JSON.stringify({
      ticker: 'BBCA',
      updatedAt: '2026-08-18T07:36:45.741124Z',
      source: 'IDX_OFFICIAL_API',
      count: 3,
      history: [
        point('2026-08-12', 6300, 100_000_000, 30_000_000, 31_000_000),
        point('2026-08-13', 6375, 90_000_000, 40_000_000, 35_000_000),
        // Baris resmi BBCA 2026-08-14 (dipakai juga di contoh spesifikasi).
        point('2026-08-14', 6350, 56_953_500, 38_196_500, 37_845_600),
      ],
    })
  );
  fs.writeFileSync(
    path.join(dataDir, 'RUSK.json'),
    JSON.stringify({
      ticker: 'RUSK',
      source: 'IDX_OFFICIAL_API',
      history: [
        // Baris cacat: close nol, foreignBuy bukan angka, tanggal hilang - harus dibuang
        // semua, BUKAN ditambal nilai default (Zero Dummy).
        { date: '2026-08-12', close: 0, volume: 10, foreignBuy: 1, foreignSell: 2 },
        { date: '2026-08-13', close: 100, volume: 10, foreignBuy: 'x', foreignSell: 2 },
        { close: 100, volume: 10, foreignBuy: 1, foreignSell: 2 },
        point('2026-08-14', 100, 1_000_000, 600_000, 100_000),
      ],
    })
  );
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('getForeignParticipationRatio', () => {
  it('menghitung porsi asing dari volume dua sisi (beli + jual dibagi 2x volume pasar)', () => {
    // Angka resmi BBCA 2026-08-14: (38.196.500 + 37.845.600) / (2 x 56.953.500) = 66,76%
    expect(getForeignParticipationRatio(38_196_500, 37_845_600, 56_953_500)).toBeCloseTo(66.8, 1);
  });

  it('mengembalikan null saat volume pasar nol atau negatif (tidak boleh bagi nol)', () => {
    expect(getForeignParticipationRatio(1000, 1000, 0)).toBeNull();
    expect(getForeignParticipationRatio(1000, 1000, -5)).toBeNull();
  });

  it('membatasi hasil maksimal 100 persen', () => {
    expect(getForeignParticipationRatio(5_000_000, 5_000_000, 1_000_000)).toBe(100);
  });
});

describe('calculateAccumulationStreak', () => {
  it('menghitung hari beruntun net foreign positif dari yang terbaru mundur', () => {
    const history = [
      point('2026-08-10', 100, 1000, 100, 500),
      point('2026-08-11', 100, 1000, 500, 100),
      point('2026-08-12', 100, 1000, 500, 100),
      point('2026-08-13', 100, 1000, 500, 100),
      point('2026-08-14', 100, 1000, 500, 100),
    ];
    expect(calculateAccumulationStreak(history)).toBe(4);
  });

  it('nol kalau hari terakhir net foreign negatif atau nol', () => {
    expect(
      calculateAccumulationStreak([
        point('2026-08-13', 100, 1000, 500, 100),
        point('2026-08-14', 100, 1000, 100, 500),
      ])
    ).toBe(0);
    expect(calculateAccumulationStreak([point('2026-08-14', 100, 1000, 300, 300)])).toBe(0);
  });

  it('nol untuk histori kosong', () => {
    expect(calculateAccumulationStreak([])).toBe(0);
  });
});

describe('summarizeForeignFlow', () => {
  it('AKUMULASI saat net hari ini dan net 5 hari sama-sama positif', () => {
    const history = [
      point('2026-08-10', 100, 1_000_000, 600_000, 100_000),
      point('2026-08-11', 100, 1_000_000, 600_000, 100_000),
      point('2026-08-12', 100, 1_000_000, 600_000, 100_000),
      point('2026-08-13', 100, 1_000_000, 600_000, 100_000),
      point('2026-08-14', 100, 1_000_000, 600_000, 100_000),
    ];
    const summary = summarizeForeignFlow(history);
    expect(summary.status).toBe('AKUMULASI');
    expect(summary.accumulationStreak).toBe(5);
    expect(summary.distributionStreak).toBe(0);
    // net harian = 500.000 lembar x Rp100 = Rp50 juta = 0,05 miliar
    expect(summary.netTodayBillion).toBeCloseTo(0.05, 4);
    expect(summary.net5DBillion).toBeCloseTo(0.25, 4);
    // 500.000 lembar / 100 = 5.000 lot
    expect(summary.netTodayLot).toBe(5000);
  });

  it('DISTRIBUSI saat net hari ini dan net 5 hari sama-sama negatif', () => {
    const history = [
      point('2026-08-13', 100, 1_000_000, 100_000, 600_000),
      point('2026-08-14', 100, 1_000_000, 100_000, 600_000),
    ];
    const summary = summarizeForeignFlow(history);
    expect(summary.status).toBe('DISTRIBUSI');
    expect(summary.distributionStreak).toBe(2);
    expect(summary.accumulationStreak).toBe(0);
  });

  it('NETRAL saat arah hari ini dan 5 hari bertentangan', () => {
    const history = [
      point('2026-08-13', 100, 1_000_000, 100_000, 900_000),
      point('2026-08-14', 100, 1_000_000, 600_000, 100_000),
    ];
    expect(summarizeForeignFlow(history).status).toBe('NETRAL');
  });

  it('mengembalikan nilai null, bukan angka karangan, saat histori kosong', () => {
    const summary = summarizeForeignFlow([]);
    expect(summary.status).toBe('NETRAL');
    expect(summary.netTodayBillion).toBeNull();
    expect(summary.net5DBillion).toBeNull();
    expect(summary.foreignParticipationPct).toBeNull();
  });
});

describe('getRealForeignFlow', () => {
  it('membaca artefak resmi BEI dan memotong sesuai jumlah hari yang diminta', () => {
    const series = getRealForeignFlow('BBCA', 2, { dataDir });
    expect(series).not.toBeNull();
    expect(series!.source).toBe('IDX_OFFICIAL_API');
    expect(series!.history).toHaveLength(2);
    expect(series!.history[1].date).toBe('2026-08-14');
    expect(series!.history[1].netForeignVolume).toBe(350_900);
    expect(series!.history[1].netForeignValueBillion).toBeCloseTo(2.228, 3);
  });

  it('menerima ticker huruf kecil dan bersuffix .JK', () => {
    expect(getRealForeignFlow('bbca.jk', 20, { dataDir })?.ticker).toBe('BBCA');
  });

  it('membuang baris cacat, bukan menambalnya', () => {
    const series = getRealForeignFlow('RUSK', 20, { dataDir });
    expect(series!.history).toHaveLength(1);
    expect(series!.history[0].date).toBe('2026-08-14');
  });

  it('null kalau artefak belum disinkronkan', () => {
    expect(getRealForeignFlow('ZZZZ', 20, { dataDir })).toBeNull();
  });

  it('menolak ticker yang mengandung path traversal', () => {
    expect(getRealForeignFlow('../../package', 20, { dataDir })).toBeNull();
    expect(getRealForeignFlow('..\\..\\package', 20, { dataDir })).toBeNull();
  });
});
