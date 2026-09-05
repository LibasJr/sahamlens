import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  crossCheckDailyClosesAgainstIdx,
  EOD_CLOSE_TOLERANCE_PCT,
  MIN_OVERLAP_DAYS,
  MAX_ARTIFACT_AGE_DAYS,
} from '../ara-eod-cross-check.service';
import { resolvePriceCrossCheckInput, evaluateAraScannerReadiness, buildCurrentAraInputReadiness } from '../ara-scanner-readiness.service';
import { probeAraPipelineCapabilities } from '../ara-readiness-probe.service';
import type { AraMarketBar } from '../ara-observation-pipeline.service';

const NOW = new Date('2026-09-05T02:00:00.000Z');
let dir: string;

function bars(closes: number[]): AraMarketBar[] {
  return closes.map((close, i) => ({
    time: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    open: close, high: close, low: close, close, volume: 1_000_000,
  }));
}

function writeArtifact(ticker: string, closes: number[], updatedAt = '2026-09-04T10:00:00.000Z') {
  fs.writeFileSync(path.join(dir, `${ticker}.json`), JSON.stringify({
    ticker, source: 'IDX_OFFICIAL_API', updatedAt,
    history: closes.map((close, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, close })),
  }));
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ara-eod-'));
  writeArtifact('AAAA', [100, 101, 102, 103, 104, 105, 106]);
  writeArtifact('BBBB', [100, 101, 102, 103, 104, 105, 106]);
  writeArtifact('CCCC', [100, 101, 102, 103, 104, 105, 106], '2026-08-01T10:00:00.000Z');
  writeArtifact('DDDD', [100, 101]);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('cross-check EOD terhadap artefak resmi IDX', () => {
  it('MATCH ketika penutupan harian cocok dalam toleransi', () => {
    const r = crossCheckDailyClosesAgainstIdx('AAAA', bars([100, 101, 102, 103, 104, 105, 106]), { dataDir: dir, now: NOW });
    expect(r.verdict).toBe('MATCH');
    expect(r.verified).toBe(true);
    expect(r.comparedDays).toBe(7);
    expect(r.mismatches).toEqual([]);
    expect(r.officialSource).toBe('IDX_OFFICIAL_API');
  });

  it('MISMATCH ketika satu hari menyimpang melewati toleransi', () => {
    // 102 -> 115 jauh di atas toleransi 0.5%.
    const r = crossCheckDailyClosesAgainstIdx('BBBB', bars([100, 101, 115, 103, 104, 105, 106]), { dataDir: dir, now: NOW });
    expect(r.verdict).toBe('MISMATCH');
    expect(r.verified).toBe(false);
    expect(r.mismatches).toHaveLength(1);
    expect(r.mismatches[0]).toMatchObject({ date: '2026-09-03', primaryClose: 115, officialClose: 102 });
    expect(r.maxDeviationPct).toBeGreaterThan(EOD_CLOSE_TOLERANCE_PCT);
  });

  it('artefak hilang => UNVERIFIED, bukan lolos diam-diam', () => {
    const r = crossCheckDailyClosesAgainstIdx('ZZZZ', bars([100, 101, 102, 103, 104, 105]), { dataDir: dir, now: NOW });
    expect(r.verdict).toBe('UNVERIFIED_NO_ARTIFACT');
    expect(r.verified).toBe(false);
  });

  it('irisan terlalu sedikit => UNVERIFIED, bukan MATCH', () => {
    const r = crossCheckDailyClosesAgainstIdx('DDDD', bars([100, 101]), { dataDir: dir, now: NOW });
    expect(r.verdict).toBe('UNVERIFIED_INSUFFICIENT_OVERLAP');
    expect(r.verified).toBe(false);
    expect(r.comparedDays).toBeLessThan(MIN_OVERLAP_DAYS);
  });

  it('artefak basi ditolak sebagai pembanding', () => {
    const r = crossCheckDailyClosesAgainstIdx('CCCC', bars([100, 101, 102, 103, 104, 105, 106]), { dataDir: dir, now: NOW });
    expect(r.verdict).toBe('UNVERIFIED_STALE_ARTIFACT');
    expect(r.verified).toBe(false);
    expect(r.artifactAgeDays).toBeGreaterThan(MAX_ARTIFACT_AGE_DAYS);
  });

  it('kode emiten tidak valid tidak boleh menyentuh filesystem', () => {
    const r = crossCheckDailyClosesAgainstIdx('../../package', bars([100, 101, 102, 103, 104, 105]), { dataDir: dir, now: NOW });
    expect(r.verdict).toBe('UNVERIFIED_NO_ARTIFACT');
    expect(r.verified).toBe(false);
  });
});

describe('cross-check EOD tidak boleh membuka eksekusi', () => {
  it('MATCH menaikkan PRICE_CROSS_CHECK ke PARTIAL, TIDAK PERNAH READY', () => {
    const r = crossCheckDailyClosesAgainstIdx('AAAA', bars([100, 101, 102, 103, 104, 105, 106]), { dataDir: dir, now: NOW });
    const input = resolvePriceCrossCheckInput(r);

    expect(r.verified).toBe(true);
    expect(input.status).toBe('PARTIAL');
    expect(input.status).not.toBe('READY');
    expect(input.detail).toContain('tidak bisa memverifikasi harga intraday');
  });

  it('scanner tetap NOT_RUN walau cross-check EOD lolos', () => {
    const r = crossCheckDailyClosesAgainstIdx('AAAA', bars([100, 101, 102, 103, 104, 105, 106]), { dataDir: dir, now: NOW });
    const readiness = evaluateAraScannerReadiness(
      buildCurrentAraInputReadiness(probeAraPipelineCapabilities(), r),
      NOW.toISOString(),
    );

    expect(readiness.status).toBe('NOT_RUN');
    expect(readiness.executionAllowed).toBe(false);
    expect(readiness.blockers).toContain('TRADING_RESTRICTIONS');
    expect(readiness.blockers).toContain('PRICE_CROSS_CHECK');
  });

  it('MISMATCH menurunkan status ke MISSING', () => {
    const r = crossCheckDailyClosesAgainstIdx('BBBB', bars([100, 101, 115, 103, 104, 105, 106]), { dataDir: dir, now: NOW });
    expect(resolvePriceCrossCheckInput(r).status).toBe('MISSING');
    expect(resolvePriceCrossCheckInput(null).status).toBe('MISSING');
  });
});
