import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getTickerUmaStatus } from '../uma-status.service';

const dirs: string[] = [];

function writeMockArtifact(value: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uma-test-'));
  dirs.push(dir);
  const file = path.join(dir, 'uma-index.json');
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('uma-status.service', () => {
  const sampleArtifact = {
    updatedAt: '2026-09-29T10:00:00.000Z',
    source: 'IDX_OFFICIAL_API',
    coverageFrom: '2026-06-01',
    coverageTo: '2026-09-29',
    count: 2,
    tickerCount: 2,
    tickers: {
      DGWG: ['2026-09-28', '2026-06-25'],
      SNLK: ['2026-09-28'],
    },
    announcements: [
      {
        umaId: '20260929002135',
        ticker: 'DGWG',
        umaDate: '2026-09-28',
        companyName: 'Delta Giri Wacana Tbk.',
        announcementNo: 'Peng-UMA-00314/BEI.WAS/09-2026',
        attachment: '/Portals/0/StaticData/NewsAndAnnouncement/UMA/2026/SEP/20260928-UMA_DGWG.pdf',
        status: 'A',
        title: 'UMA atas Saham PT Delta Giri Wacana Tbk. (DGWG)',
      },
      {
        umaId: '20260929002005',
        ticker: 'SNLK',
        umaDate: '2026-09-28',
        companyName: 'Sunter Lakeside Hotel Tbk.',
        announcementNo: 'Peng-UMA-00313/BEI.WAS/09-2026',
        attachment: '/Portals/0/StaticData/NewsAndAnnouncement/UMA/2026/SEP/20260928-UMA_SNLK.pdf',
        status: 'A',
        title: 'UMA atas Saham PT Sunter Lakeside Hotel Tbk. (SNLK)',
      },
    ],
  };

  it('mengidentifikasi DGWG memiliki status UMA aktif', () => {
    const file = writeMockArtifact(sampleArtifact);
    const asOf = new Date('2026-09-29T12:00:00Z');
    const res = getTickerUmaStatus('DGWG', {
      artifactPath: file,
      now: asOf,
      activeWindowDays: 30,
    });

    expect(res.ticker).toBe('DGWG');
    expect(res.isUma).toBe(true);
    expect(res.lastUmaDate).toBe('2026-09-28');
    expect(res.announcementNo).toBe('Peng-UMA-00314/BEI.WAS/09-2026');
    expect(res.daysAgo).toBe(1);
    expect(res.historyCount).toBe(2);
  });

  it('menolak ticker tanpa UMA sebagai isUma: false', () => {
    const file = writeMockArtifact(sampleArtifact);
    const asOf = new Date('2026-09-29T12:00:00Z');
    const res = getTickerUmaStatus('BBCA', {
      artifactPath: file,
      now: asOf,
    });

    expect(res.ticker).toBe('BBCA');
    expect(res.isUma).toBe(false);
    expect(res.lastUmaDate).toBeNull();
    expect(res.daysAgo).toBeNull();
  });

  it('mengabaikan UMA kadaluarsa bila di luar activeWindowDays', () => {
    const file = writeMockArtifact(sampleArtifact);
    const futureDate = new Date('2026-10-30T12:00:00Z');
    const res = getTickerUmaStatus('DGWG', {
      artifactPath: file,
      now: futureDate,
      activeWindowDays: 14,
    });

    expect(res.ticker).toBe('DGWG');
    expect(res.isUma).toBe(false);
    expect(res.lastUmaDate).toBe('2026-09-28');
    expect(res.daysAgo).toBe(32);
  });
});
