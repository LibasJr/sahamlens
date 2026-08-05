import { describe, expect, it, vi } from 'vitest';
import { archiveLensRadarHistory } from '../history-archive.service';
import {
  DATA_SNAPSHOT_VERSION,
  SCORE_VERSION,
  SIGNAL_VERSION,
  VALUATION_VERSION,
} from '../../constants/model-version';
import { PRICE_ADJUSTMENT_VERSION, TRADING_PRICE_BASIS } from '@/shared/market/price-basis';

vi.mock('@/shared/database/schema.service', () => ({
  ensureSharedSchema: async () => {},
}));

vi.mock('@/shared/database/postgres.client', () => ({
  pool: { query: async () => ({ rows: [] }) },
}));

function captureDb() {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return { rows: [] };
    },
  };
}

/**
 * FASE 1 - setiap baris histori BARU wajib membawa penanda versi model.
 *
 * Tanpa ini, kalibrasi berikutnya akan mencampur skor dari mesin yang bobot & ambangnya
 * sudah berubah, dan hasilnya tidak mengukur model mana pun.
 */
describe('archiveLensRadarHistory (Fase 1)', () => {
  it('menuliskan score/valuation/signal/data_snapshot version + calculation_timestamp', async () => {
    const db = captureDb();

    const saved = await archiveLensRadarHistory(
      [{ symbol: 'BBCA', price: 10_000, totalScore: 82, coverage: 95, marketCap: 1e15 }],
      '2026-08-05',
      db
    );

    expect(saved).toBe(1);
    expect(db.calls).toHaveLength(1);

    const { sql, params } = db.calls[0];
    for (const column of [
      'score_version',
      'valuation_version',
      'signal_version',
      'data_snapshot_version',
      'calculation_timestamp',
      'raw_close_price',
      'adjusted_close_price',
      'price_basis',
      'adjustment_factor',
      'corporate_action_status',
      'price_data_timestamp',
      'price_data_version',
    ]) {
      expect(sql).toContain(column);
    }

    expect(params).toContain(SCORE_VERSION);
    expect(params).toContain(VALUATION_VERSION);
    expect(params).toContain(SIGNAL_VERSION);
    expect(params).toContain(DATA_SNAPSHOT_VERSION);

    expect(params).toContain(TRADING_PRICE_BASIS);
    expect(params).toContain(PRICE_ADJUSTMENT_VERSION);

    const timestamp = params.find((param) => typeof param === 'string' && Number.isFinite(Date.parse(param as string)));
    expect(typeof timestamp).toBe('string');
    expect(Number.isFinite(Date.parse(timestamp as string))).toBe(true);
  });

  it('tidak menulis baris yang harganya tidak valid', async () => {
    const db = captureDb();

    const saved = await archiveLensRadarHistory(
      [{ symbol: 'XXXX', price: 0, totalScore: 82 }],
      '2026-08-05',
      db
    );

    expect(saved).toBe(0);
    expect(db.calls).toHaveLength(0);
  });
});
