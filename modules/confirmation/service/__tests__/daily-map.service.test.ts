import { describe, expect, it } from 'vitest';

import {
  DAILY_MAP_JOB_META,
  buildDailyMap,
  formatWibWindow,
  wibHour,
  type DailyMapLogRow,
  type DailyMapJobMeta,
} from '../daily-map.service';

const META: DailyMapJobMeta[] = [
  { jobName: 'idx-flow-sync', label: 'Aliran broker dan asing (IDX)', whatItRefreshes: 'x', page: '/ownership-flow' },
  { jobName: 'screener-scan', label: 'Pemindaian screener', whatItRefreshes: 'y', page: '/screener' },
];

const LOG: DailyMapLogRow[] = [
  {
    jobName: 'idx-flow-sync',
    status: 'SUCCESS',
    lastRunAt: '2026-09-23T10:48:27.296Z',
    runsLast7Days: 7,
    hourWib: 17,
    hourWibMin: 17,
    hourWibMax: 17,
  },
];

describe('wibHour', () => {
  it('mengubah stempel waktu ke jam WIB tanpa menebak', () => {
    expect(wibHour('2026-09-24T10:48:00Z')).toBe(17);
    expect(wibHour('2026-09-24T01:00:00+07:00')).toBe(1);
    expect(wibHour(null)).toBeNull();
    expect(wibHour('bukan-tanggal')).toBeNull();
  });
});

describe('formatWibWindow', () => {
  it('menampilkan jendela satu jam atau rentang', () => {
    expect(formatWibWindow(17, 17)).toBe('17:00 WIB');
    expect(formatWibWindow(17, 20)).toBe('17:00-20:59 WIB');
    expect(formatWibWindow(null, 20)).toBeNull();
  });
});

describe('buildDailyMap', () => {
  const data = buildDailyMap(LOG, META, '2026-09-24T05:00:00.000Z');
  const byName = new Map(data.jobs.map((job) => [job.jobName, job]));

  it('memakai bukti riwayat apa adanya untuk tugas yang tercatat', () => {
    const job = byName.get('idx-flow-sync');
    expect(job?.recorded).toBe(true);
    expect(job?.lastStatus).toBe('SUCCESS');
    expect(job?.runsLast7Days).toBe(7);
    expect(job?.usualWindow).toBe('17:00 WIB');
    expect(job?.lastRunHour).toBe(17);
  });

  it('tidak memberi status sukses pada tugas tanpa riwayat', () => {
    const job = byName.get('screener-scan');
    expect(job?.recorded).toBe(false);
    expect(job?.lastStatus).toBe('BELUM_TERCATAT');
    expect(job?.runsLast7Days).toBe(0);
    expect(job?.lastRunAt).toBeNull();
    expect(job?.usualWindow).toBeNull();
  });

  it('meneruskan status gagal apa adanya', () => {
    const failed = buildDailyMap(
      [{ ...LOG[0], jobName: 'screener-scan', status: 'FAILED', hourWibMin: 9, hourWibMax: 16 }],
      META
    );
    expect(failed.jobs.find((job) => job.jobName === 'screener-scan')?.lastStatus).toBe('FAILED');
    expect(failed.jobs.find((job) => job.jobName === 'screener-scan')?.usualWindow).toBe('09:00-16:59 WIB');
  });

  it('mendaftarkan tugas yang jalan tetapi belum punya keterangan', () => {
    expect(data.undocumentedJobs.map((job) => job.jobName)).toEqual([]);
    const withExtra = buildDailyMap(
      [...LOG, { ...LOG[0], jobName: 'job-baru', runsLast7Days: 3, status: 'SUCCESS' }],
      META
    );
    expect(withExtra.undocumentedJobs.map((job) => job.jobName)).toEqual(['job-baru']);
  });

  it('menyatakan meta kerja terbuka dan berlabel halaman yang jelas', () => {
    expect(DAILY_MAP_JOB_META.length).toBeGreaterThan(15);
    for (const entry of DAILY_MAP_JOB_META) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.whatItRefreshes.length).toBeGreaterThan(0);
    }
  });
});