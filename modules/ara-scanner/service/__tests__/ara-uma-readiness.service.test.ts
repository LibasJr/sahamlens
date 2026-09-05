import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  probeOfficialUmaArtifact,
  resolveTradingRestrictionsInput,
} from '../ara-uma-readiness.service';

const NOW = new Date('2026-09-05T05:00:00.000Z');
const dirs: string[] = [];

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    updatedAt: '2026-09-05T04:00:00.000Z',
    source: 'IDX_OFFICIAL_API',
    coverageFrom: '2026-05-08',
    coverageTo: '2026-09-03',
    count: 1,
    tickerCount: 1,
    tickers: { NATO: ['2026-09-02'] },
    announcements: [{ umaId: '202609020001', ticker: 'NATO', umaDate: '2026-09-02' }],
    ...overrides,
  };
}

function write(value: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ara-uma-'));
  dirs.push(dir);
  const file = path.join(dir, 'uma-index.json');
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('probeOfficialUmaArtifact', () => {
  it('mengakui artefak resmi yang segar hanya sebagai PARTIAL karena suspensi belum tercakup', () => {
    const result = probeOfficialUmaArtifact(write(artifact()), NOW);
    expect(result).toMatchObject({
      verified: true,
      status: 'PARTIAL',
      source: 'IDX_OFFICIAL_API GetUMA via data/idx-uma',
      observedAt: '2026-09-05T04:00:00.000Z',
      count: 1,
      tickerCount: 1,
      coverageFrom: '2026-05-08',
      coverageTo: '2026-09-03',
    });
    expect(resolveTradingRestrictionsInput(result)).toMatchObject({
      key: 'TRADING_RESTRICTIONS',
      status: 'PARTIAL',
      required: true,
      ownedBy: 'SAHAMLENS',
    });
  });

  it('fail-closed jika file hilang, JSON rusak, atau provenance bukan IDX resmi', () => {
    const missing = probeOfficialUmaArtifact('/tidak/ada/uma.json', NOW);
    const invalid = write('{bukan-json');
    const foreign = write(artifact({ source: 'INDEX_ALPHA_API' }));

    expect(missing.status).toBe('MISSING');
    expect(probeOfficialUmaArtifact(invalid, NOW).status).toBe('MISSING');
    expect(probeOfficialUmaArtifact(foreign, NOW)).toMatchObject({
      verified: false,
      status: 'MISSING',
      source: null,
    });
  });

  it('menandai stale berdasarkan updatedAt tanpa menghapus provenance dan cakupan', () => {
    const result = probeOfficialUmaArtifact(
      write(artifact({ updatedAt: '2026-09-01T00:00:00.000Z' })),
      NOW,
    );
    expect(result).toMatchObject({
      verified: false,
      status: 'STALE',
      source: 'IDX_OFFICIAL_API GetUMA via data/idx-uma',
      coverageFrom: '2026-05-08',
    });
  });

  it('menolak coverage yang tidak menutup 30 hari dan jumlah yang tidak konsisten', () => {
    const shallow = write(artifact({ coverageFrom: '2026-08-20' }));
    const wrongCount = write(artifact({ count: 99 }));
    expect(probeOfficialUmaArtifact(shallow, NOW).status).toBe('MISSING');
    expect(probeOfficialUmaArtifact(wrongCount, NOW).status).toBe('MISSING');
  });

  it('menolak baris duplikat dan indeks per-ticker yang tidak konsisten', () => {
    const duplicate = artifact({
      count: 2,
      announcements: [
        { umaId: 'same', ticker: 'NATO', umaDate: '2026-09-02' },
        { umaId: 'same', ticker: 'PTSP', umaDate: '2026-09-03' },
      ],
      tickerCount: 2,
      tickers: { NATO: ['2026-09-02'], PTSP: ['2026-09-03'] },
    });
    const brokenIndex = artifact({ tickers: { NATO: ['2026-09-01'] } });
    expect(probeOfficialUmaArtifact(write(duplicate), NOW).status).toBe('MISSING');
    expect(probeOfficialUmaArtifact(write(brokenIndex), NOW).status).toBe('MISSING');
  });
});
