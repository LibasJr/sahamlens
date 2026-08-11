import { describe, expect, it, vi, beforeEach } from 'vitest';

const { fakePool, queries } = vi.hoisted(() => {
  const queries: { text: string; values: unknown[] }[] = [];
  return {
    queries,
    fakePool: {
      query: vi.fn(async (text: string, values: unknown[] = []) => {
        queries.push({ text, values });
        if (text.includes('RETURNING id')) return { rows: [{ id: 7 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
    },
  };
});

vi.mock('../../database/postgres.client', () => ({ pool: fakePool }));
vi.mock('../../database/schema.service', () => ({ ensureSharedSchema: vi.fn(async () => {}) }));

import { withJobRunLog, recordJobNonRun } from '../job-run-log.repository';

beforeEach(() => {
  queries.length = 0;
  fakePool.query.mockClear();
});

describe('withJobRunLog', () => {
  // Sebelumnya finishJobRun dipanggil TANPA meta, jadi angka hasil job hilang. Run yang
  // "SUCCESS" tapi mengarsipkan 0 baris jadi tidak bisa dibedakan dari run yang bekerja -
  // persis kasus lens_radar_history yang kosong berhari-hari tanpa petunjuk.
  it('menyimpan hasil job sebagai meta saat sukses', async () => {
    await withJobRunLog('ai-pick-scan', async () => ({ scored: 220, archived: 0 }));

    const update = queries.find((q) => q.text.includes('UPDATE job_run_log'))!;
    expect(update.values[1]).toBe('SUCCESS');
    expect(JSON.parse(update.values[3] as string)).toEqual({ scored: 220, archived: 0 });
  });

  it('hasil non-objek tidak dipaksa jadi meta', async () => {
    await withJobRunLog('job-angka', async () => 42);

    const update = queries.find((q) => q.text.includes('UPDATE job_run_log'))!;
    expect(update.values[3]).toBeNull();
  });

  it('kegagalan tercatat FAILED beserta pesannya, dan errornya tetap dilempar', async () => {
    await expect(
      withJobRunLog('job-gagal', async () => { throw new Error('Yahoo timeout'); })
    ).rejects.toThrow('Yahoo timeout');

    const update = queries.find((q) => q.text.includes('UPDATE job_run_log'))!;
    expect(update.values[1]).toBe('FAILED');
    expect(update.values[2]).toBe('Yahoo timeout');
  });
});

describe('recordJobNonRun', () => {
  it('mencatat pemanggilan yang dilewati beserta alasannya', async () => {
    await recordJobNonRun('ai-pick-scan', 'SKIPPED', 'Di luar jendela scan IDX', { scanWindow: 'CLOSED' });

    const insert = queries.find((q) => q.text.includes('INSERT INTO job_run_log'))!;
    expect(insert.values[0]).toBe('ai-pick-scan');
    expect(insert.values[1]).toBe('SKIPPED');
    expect(insert.values[2]).toBe('Di luar jendela scan IDX');
    expect(JSON.parse(insert.values[3] as string)).toEqual({ scanWindow: 'CLOSED' });
  });

  it('penolakan signature tercatat terpisah dari dilewati', async () => {
    await recordJobNonRun('ai-pick-scan', 'REJECTED', 'Signature QStash tidak valid');

    const insert = queries.find((q) => q.text.includes('INSERT INTO job_run_log'))!;
    expect(insert.values[1]).toBe('REJECTED');
  });

  // Pencatatan ini alat diagnosis, bukan bagian pekerjaan job. Kalau database sedang
  // bermasalah, cron TIDAK boleh ikut gagal hanya karena gagal mencatat.
  it('tidak melempar kalau database bermasalah', async () => {
    fakePool.query.mockRejectedValueOnce(new Error('connection refused'));

    await expect(recordJobNonRun('ai-pick-scan', 'SKIPPED', 'apa pun')).resolves.toBeUndefined();
  });
});
