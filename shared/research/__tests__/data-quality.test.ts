import { describe, expect, it } from 'vitest';
import { assessResearchDataQuality } from '../data-quality';

const NOW = Date.parse('2026-08-27T09:00:00.000Z');

describe('critical research data-quality gate', () => {
  it('accepts traceable, current, versioned point-in-time research metadata', () => {
    expect(assessResearchDataQuality({
      source: 'YAHOO_CHART',
      period: '1y',
      expectedPeriod: '1y',
      dataMode: 'POINT_IN_TIME',
      asOf: '2026-08-27T08:55:00.000Z',
      retrievedAt: '2026-08-27T09:00:00.000Z',
      modelVersion: 'lens-score-v1.5.0',
      dataSnapshotVersion: 'ohlcv-v2',
      values: { score: { value: 84, min: 0, max: 100 } },
    }, {
      nowMs: NOW,
      maxAgeMs: 60 * 60_000,
      requirePeriod: true,
      requireDataMode: true,
      expectedDataMode: 'POINT_IN_TIME',
      requireModelVersion: true,
      requireSnapshotVersion: true,
    })).toEqual([]);
  });

  it('detects wrong period, current-data leakage, future dates, and placeholders', () => {
    const codes = assessResearchDataQuality({
      source: 'dummy source',
      period: 'FY2025',
      expectedPeriod: 'FY2026',
      dataMode: 'CURRENT',
      asOf: '2026-08-28T09:00:00.000Z',
      retrievedAt: 'invalid',
      modelVersion: 'unknown-version',
      dataSnapshotVersion: '',
    }, {
      nowMs: NOW,
      maxAgeMs: 60_000,
      requireDataMode: true,
      expectedDataMode: 'POINT_IN_TIME',
      requireModelVersion: true,
      requireSnapshotVersion: true,
    }).map((issue) => issue.code);

    expect(codes).toEqual(expect.arrayContaining([
      'PERIOD_MISMATCH',
      'DATA_MODE_MISMATCH',
      'AS_OF_FUTURE',
      'RETRIEVED_AT_INVALID',
      'SNAPSHOT_VERSION_MISSING',
      'PLACEHOLDER_METADATA',
    ]));
  });

  it('requires an explicit data mode for point-in-time research', () => {
    expect(assessResearchDataQuality({
      source: 'IDX',
      retrievedAt: '2026-08-27T09:00:00.000Z',
    }, {
      nowMs: NOW,
      requireDataMode: true,
    }).map((issue) => issue.code)).toContain('DATA_MODE_MISSING');
  });

  it('flags stale data separately from valid historical research and rejects impossible values', () => {
    const issues = assessResearchDataQuality({
      source: 'IDX',
      asOf: '2026-08-20T09:00:00.000Z',
      retrievedAt: '2026-08-27T09:00:00.000Z',
      values: {
        score: { value: 101, min: 0, max: 100 },
        price: { value: Number.NaN, min: 0 },
      },
    }, { nowMs: NOW, maxAgeMs: 24 * 60 * 60_000 });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'STALE',
      'VALUE_OUT_OF_RANGE',
      'VALUE_NON_FINITE',
    ]));

    expect(assessResearchDataQuality({
      source: 'BACKTEST_CACHE',
      asOf: '2020-01-01',
      retrievedAt: '2026-08-27T09:00:00.000Z',
    }, { nowMs: NOW })).toEqual([]);
  });
});
