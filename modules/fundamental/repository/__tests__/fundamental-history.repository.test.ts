import { describe, it, expect, beforeEach, vi } from 'vitest';

// P0-5: arsip fundamental point-in-time.
//
// CARA UJI & BATASNYA - dinyatakan terbuka supaya tidak dibaca lebih kuat dari
// kenyataannya: test ini TIDAK menjalankan Postgres. Ia memakai pengganti in-memory yang
// menerapkan HANYA semantik yang dipakai repository ini (PRIMARY KEY (ticker,
// observed_date) + ON CONFLICT DO NOTHING untuk INSERT; filter `observed_date <= $2` +
// ORDER BY DESC + LIMIT 1 untuk SELECT). Karena itu ada dua lapis pemeriksaan:
//   (a) BENTUK SQL diperiksa apa adanya sebagai string - kalau `ON CONFLICT ... DO
//       NOTHING` atau tanda `<=` hilang dari query, test gagal, walau logika pengganti
//       di bawah tetap berperilaku benar.
//   (b) SEMANTIK diuji lewat pengganti itu - membuktikan repository mengirim
//       requestedDate (bukan tanggal hari ini) sebagai batas atas, dan memetakan hasilnya
//       dengan benar.
// Yang TIDAK dibuktikan test ini: perilaku Postgres sungguhan (tipe DATE, presisi
// NUMERIC, perilaku index). Itu perlu integration test dengan database nyata.

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

// vi.hoisted() - factory vi.mock() diangkat ke atas file, jadi variabel yang dipakai di
// dalamnya harus ikut diangkat. Tanpa ini: "Cannot access 'fakePool' before initialization".
const { fakePool, queries, state } = vi.hoisted(() => {
  const queries: { text: string; values: unknown[] }[] = [];
  const state: { table: Record<string, unknown>[] } = { table: [] };

  const norm = (sql: string) => sql.replace(/\s+/g, ' ').trim();

  const fakePool = {
    query: vi.fn(async (text: string, values: unknown[] = []) => {
      queries.push({ text, values });
      const sql = norm(text);
      const table = state.table;

      if (sql.startsWith('INSERT INTO fundamental_history')) {
        // Pengganti untuk PRIMARY KEY (ticker, observed_date) + ON CONFLICT DO NOTHING.
        // Urutan WAJIB sama persis dengan tuple INSERT di repository (10 kolom sejak
        // PIT v2 menambahkan period_end dan source) - kalau meleset, pemotongan params
        // bergeser dan hasil hitung baris jadi salah.
        const columns = ['ticker', 'observed_date', 'period_end', 'per', 'pbv', 'roe', 'der', 'current_ratio', 'revenue_growth', 'source'];
        let inserted = 0;
        for (let i = 0; i < values.length; i += columns.length) {
          const row: Record<string, unknown> = {};
          columns.forEach((c, j) => { row[c] = values[i + j]; });
          const bentrok = table.some(
            (r) => r.ticker === row.ticker && r.observed_date === row.observed_date
          );
          if (bentrok) continue;             // DO NOTHING - baris lama TIDAK ditimpa
          table.push(row);
          inserted++;
        }
        return { rows: [], rowCount: inserted };
      }

      if (sql.startsWith('SELECT') && sql.includes('WHERE ticker = $1 AND observed_date <= $2')) {
        const [ticker, requestedDate] = values as [string, string];
        const hasil = table
          .filter((r) => r.ticker === ticker && String(r.observed_date) <= requestedDate)
          .sort((a, b) => String(b.observed_date).localeCompare(String(a.observed_date)))
          .slice(0, 1);
        return { rows: hasil, rowCount: hasil.length };
      }

      if (sql.startsWith('SELECT') && sql.includes('WHERE ticker = $1 ORDER BY observed_date ASC')) {
        const [ticker] = values as [string];
        const hasil = table
          .filter((r) => r.ticker === ticker)
          .sort((a, b) => String(a.observed_date).localeCompare(String(b.observed_date)));
        return { rows: hasil, rowCount: hasil.length };
      }

      throw new Error(`Query tidak dikenali oleh pengganti: ${sql.slice(0, 120)}`);
    }),
  };

  return { fakePool, queries, state };
});

vi.mock('../../../../shared/database/postgres.client', () => ({ pool: fakePool }));
vi.mock('../../../../shared/database/schema.service', () => ({
  ensureSharedSchema: vi.fn(async () => {}),
}));
vi.mock('../../../../shared/logger/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import {
  archiveFundamentalSnapshot,
  archiveFundamentalSnapshotSafe,
  asOf,
  listHistory,
} from '../fundamental-history.repository';

const KOSONG = { per: null, pbv: null, roe: null, der: null, currentRatio: null, revenueGrowth: null };

beforeEach(() => {
  state.table = [];
  queries.length = 0;
  fakePool.query.mockClear();
});

describe('archiveFundamentalSnapshot - penyimpanan & idempotensi', () => {
  it('menyimpan snapshot fundamental (TEST 5)', async () => {
    const n = await archiveFundamentalSnapshot([
      { ticker: 'BBCA.JK', observedDate: '2026-08-05', per: 22.1, pbv: 4.3, roe: 21.5, der: 0.2, currentRatio: null, revenueGrowth: 8.4 },
    ]);

    expect(n).toBe(1);
    const rows = await listHistory('BBCA.JK');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ticker: 'BBCA.JK', observedDate: '2026-08-05', per: 22.1, roe: 21.5 });
    expect(rows[0].currentRatio).toBeNull();
  });

  it('cron dieksekusi dua kali pada tanggal sama => tetap satu baris (TEST 6)', async () => {
    const batch = [{ ticker: 'BBCA.JK', observedDate: '2026-08-05', ...KOSONG, per: 22.1 }];

    expect(await archiveFundamentalSnapshot(batch)).toBe(1);
    expect(await archiveFundamentalSnapshot(batch)).toBe(0);

    expect(await listHistory('BBCA.JK')).toHaveLength(1);
  });

  it('eksekusi ulang TIDAK menimpa nilai yang sudah terarsip', async () => {
    await archiveFundamentalSnapshot([{ ticker: 'BBCA.JK', observedDate: '2026-08-05', ...KOSONG, per: 22.1 }]);
    // Yahoo mengembalikan angka berbeda pada percobaan kedua di hari yang sama.
    await archiveFundamentalSnapshot([{ ticker: 'BBCA.JK', observedDate: '2026-08-05', ...KOSONG, per: 99.9 }]);

    const rows = await listHistory('BBCA.JK');
    expect(rows).toHaveLength(1);
    expect(rows[0].per).toBe(22.1);
  });

  it('snapshot hari berikutnya TIDAK menimpa hari sebelumnya (TEST 7)', async () => {
    await archiveFundamentalSnapshot([{ ticker: 'BBCA.JK', observedDate: '2026-08-05', ...KOSONG, per: 22.1 }]);
    await archiveFundamentalSnapshot([{ ticker: 'BBCA.JK', observedDate: '2026-08-06', ...KOSONG, per: 23.4 }]);

    const rows = await listHistory('BBCA.JK');
    expect(rows.map((r) => r.observedDate)).toEqual(['2026-08-05', '2026-08-06']);
    expect(rows.map((r) => r.per)).toEqual([22.1, 23.4]);
  });

  it('SQL memakai ON CONFLICT DO NOTHING dan seluruh nilai diparameterkan', async () => {
    await archiveFundamentalSnapshot([
      { ticker: 'BBCA.JK', observedDate: '2026-08-05', ...KOSONG, per: 22.1 },
      { ticker: 'BBRI.JK', observedDate: '2026-08-05', ...KOSONG, per: 12.3 },
    ]);

    const q = queries.find((x) => x.text.includes('INSERT INTO fundamental_history'))!;
    expect(normalize(q.text)).toContain('ON CONFLICT (ticker, observed_date) DO NOTHING');
    // Tidak ada UPDATE/DO UPDATE - arsip ini append-only.
    expect(normalize(q.text)).not.toContain('DO UPDATE');
    // 2 baris x 10 kolom, dan tidak ada nilai yang tertanam di string SQL.
    expect(q.values).toHaveLength(20);
    expect(q.text).not.toContain('BBCA.JK');
    expect(q.text).not.toContain('2026-08-05');
  });

  it('daftar kosong tidak menembak database sama sekali', async () => {
    expect(await archiveFundamentalSnapshot([])).toBe(0);
    expect(fakePool.query).not.toHaveBeenCalled();
  });

  it('observedDate bukan YYYY-MM-DD ditolak, bukan disimpan dengan format campur', async () => {
    await expect(
      archiveFundamentalSnapshot([{ ticker: 'X.JK', observedDate: '05/08/2026', ...KOSONG }])
    ).rejects.toThrow(/YYYY-MM-DD/);
    expect(fakePool.query).not.toHaveBeenCalled();
  });
});

describe('asOf - bebas look-ahead bias (TEST 8)', () => {
  beforeEach(async () => {
    await archiveFundamentalSnapshot([
      { ticker: 'BBCA.JK', observedDate: '2026-08-03', ...KOSONG, per: 20 },
      { ticker: 'BBCA.JK', observedDate: '2026-08-05', ...KOSONG, per: 22 },
      { ticker: 'BBCA.JK', observedDate: '2026-09-01', ...KOSONG, per: 25 },
    ]);
  });

  it('mengembalikan snapshot TERBARU yang tidak melewati tanggal yang diminta', async () => {
    expect((await asOf('BBCA.JK', '2026-08-05'))?.observedDate).toBe('2026-08-05');
    expect((await asOf('BBCA.JK', '2026-08-04'))?.observedDate).toBe('2026-08-03');
    expect((await asOf('BBCA.JK', '2026-12-31'))?.observedDate).toBe('2026-09-01');
  });

  it('TIDAK PERNAH mengembalikan snapshot masa depan', async () => {
    const r = await asOf('BBCA.JK', '2026-08-04');
    expect(r?.observedDate).toBe('2026-08-03');
    expect(r?.per).toBe(20);          // BUKAN 22 dari 2026-08-05
  });

  it('tanggal sebelum arsip dimulai => null, bukan baris terdekat', async () => {
    expect(await asOf('BBCA.JK', '2026-01-01')).toBeNull();
  });

  it('ticker tidak dikenal => null, bukan melempar', async () => {
    expect(await asOf('TIDAKADA.JK', '2026-08-05')).toBeNull();
  });

  it('SQL menyatakan batas atas `<=`, bukan `<` maupun tanpa batas', async () => {
    await asOf('BBCA.JK', '2026-08-04');
    const q = queries.find((x) => x.text.includes('FROM fundamental_history') && x.text.includes('LIMIT 1'))!;
    expect(normalize(q.text)).toContain('WHERE ticker = $1 AND observed_date <= $2::date');
    expect(normalize(q.text)).toContain('ORDER BY observed_date DESC');
    expect(q.values).toEqual(['BBCA.JK', '2026-08-04']);
  });

  it('requestedDate tidak valid ditolak, bukan diam-diam jadi hari ini', async () => {
    await expect(asOf('BBCA.JK', 'kemarin')).rejects.toThrow(/YYYY-MM-DD/);
  });
});

// REGRESI: pergeseran tanggal satu hari di server non-UTC.
//
// node-postgres mem-parse tipe `date` (OID 1082) jadi JS Date pada tengah malam WAKTU
// LOKAL. Dulu repository membaca kolom DATE apa adanya lalu memformatnya dengan
// getUTC*, jadi di TZ positif (mis. WIB/UTC+7) 2025-04-09 terbaca 2025-04-08 - tanggal
// publikasi laporan mundur sehari di seluruh API. Pencegahnya: SELECT meng-cast DATE ke
// ::text sehingga Postgres mengirim 'YYYY-MM-DD' dan tidak ada objek Date sama sekali.
describe('pemetaan DATE tidak bergeser oleh timezone', () => {
  it('SELECT meng-cast kolom DATE ke ::text (bukan menyerahkannya jadi objek Date)', async () => {
    await asOf('BBCA.JK', '2026-08-04');
    await listHistory('BBCA.JK');

    const selects = queries.filter((x) => normalize(x.text).startsWith('SELECT ticker'));
    expect(selects).toHaveLength(2);
    for (const q of selects) {
      expect(normalize(q.text)).toContain('observed_date::text AS observed_date');
      expect(normalize(q.text)).toContain('period_end::text AS period_end');
    }
  });

  it('string YYYY-MM-DD dari Postgres dipetakan apa adanya, tanpa konversi waktu', async () => {
    // Persis bentuk yang dikirim Postgres untuk `::text` atas DATE (DateStyle ISO).
    state.table.push({
      ticker: 'ANTM.JK', observed_date: '2025-04-09', period_end: '2024-12-31',
      per: null, pbv: null, roe: null, der: null, current_ratio: null, revenue_growth: null,
    });

    const r = await asOf('ANTM.JK', '2025-04-09');
    expect(r?.observedDate).toBe('2025-04-09');   // BUKAN 2025-04-08
    expect(r?.periodEnd).toBe('2024-12-31');      // BUKAN 2024-12-30
  });

  it('period_end NULL tetap null, tidak berubah jadi string kosong/epoch', async () => {
    state.table.push({
      ticker: 'LAMA.JK', observed_date: '2026-01-30', period_end: null,
      per: 10, pbv: null, roe: null, der: null, current_ratio: null, revenue_growth: null,
    });

    const r = await asOf('LAMA.JK', '2026-01-30');
    expect(r?.observedDate).toBe('2026-01-30');
    expect(r?.periodEnd).toBeNull();
  });
});

describe('archiveFundamentalSnapshotSafe - kegagalan database', () => {
  it('database down TIDAK menggagalkan cron, dan dilaporkan bukan ditelan', async () => {
    fakePool.query.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const hasil = await archiveFundamentalSnapshotSafe([
      { ticker: 'BBCA.JK', observedDate: '2026-08-05', ...KOSONG },
    ]);

    expect(hasil.archived).toBe(0);
    expect(hasil.error).toContain('ECONNREFUSED');
  });

  it('sukses melaporkan jumlah baris BARU, bukan jumlah baris yang dikirim', async () => {
    const batch = [
      { ticker: 'A.JK', observedDate: '2026-08-05', ...KOSONG },
      { ticker: 'B.JK', observedDate: '2026-08-05', ...KOSONG },
    ];
    expect((await archiveFundamentalSnapshotSafe(batch)).archived).toBe(2);
    expect((await archiveFundamentalSnapshotSafe(batch)).archived).toBe(0);
  });
});
