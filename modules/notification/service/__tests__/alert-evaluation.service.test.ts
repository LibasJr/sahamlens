import { describe, expect, it } from 'vitest';
import type { Alert } from '@/modules/watchlist';
import { formatMessage, isTriggered } from '../alert-evaluation.service';

const alert: Alert = {
  id: 'alert-1',
  user_id: 'user-1',
  symbol: 'BBCA',
  condition_type: 'CONSENSUS_STRONG_BUY',
  condition_value: null,
  triggered: false,
  created_at: '2026-08-27T00:00:00.000Z',
};

function stock(decision?: unknown, consensus = 'STRONG BUY') {
  return { decision, consensusData: { kategori: consensus } };
}

describe('CONSENSUS_STRONG_BUY alert respects actionable decision', () => {
  it('fail-closed ketika decision hilang', () => {
    expect(isTriggered(alert, { stock: stock(undefined) })).toBe(false);
  });

  it('MODEL_UNVALIDATED/advisory false tidak memicu alert', () => {
    expect(isTriggered(alert, {
      stock: stock({ advisory: false, action: null, reasonCodes: ['MODEL_UNVALIDATED'] }),
    })).toBe(false);
  });

  it('consensus STRONG BUY tidak boleh mengalahkan action SELL', () => {
    expect(isTriggered(alert, {
      stock: stock({ advisory: true, action: 'SELL', reasonCodes: [] }),
    })).toBe(false);
  });

  it('baru memicu jika advisory true, action bullish, dan consensus STRONG BUY', () => {
    expect(isTriggered(alert, {
      stock: stock({ advisory: true, action: 'BUY', reasonCodes: [] }),
    })).toBe(true);
  });
});

describe('alert evaluation treats API payloads as untrusted', () => {
  it('PRICE_ABOVE fail-closed ketika target null', () => {
    const priceAlert: Alert = { ...alert, condition_type: 'PRICE_ABOVE', condition_value: null };
    expect(isTriggered(priceAlert, { stock: { price: 5000 } })).toBe(false);
  });

  it('mengabaikan harga dan RSI bertipe string dari payload eksternal', () => {
    const priceAlert: Alert = { ...alert, condition_type: 'PRICE_BELOW', condition_value: 6000 };
    expect(isTriggered(priceAlert, { stock: { price: '5000' } })).toBe(false);

    const rsiAlert: Alert = { ...alert, condition_type: 'RSI_OVERSOLD', condition_value: null };
    expect(isTriggered(rsiAlert, {
      stock: { analyzers: [{ label: 'RSI', raw: { rsi: '12' }, value: null }] },
    })).toBe(false);
  });

  it('BREAKOUT dan breadth hanya menerima angka finite', () => {
    const breakoutAlert: Alert = { ...alert, condition_type: 'BREAKOUT_SCORE_ABOVE', condition_value: 6 };
    expect(isTriggered(breakoutAlert, { breakoutEntry: { score: '8' } })).toBe(false);
    expect(isTriggered(breakoutAlert, { breakoutEntry: { score: 7 } })).toBe(true);

    const breadthAlert: Alert = { ...alert, condition_type: 'BREADTH_ADVANCING_BELOW', condition_value: 100 };
    expect(isTriggered(breadthAlert, { breadth: { advancing: Number.NaN } })).toBe(false);
    expect(isTriggered(breadthAlert, { breadth: { advancing: 80 } })).toBe(true);
  });
});

describe('formatMessage untuk notifikasi push/telegram', () => {
  it('teks notifikasi CONSENSUS_STRONG_BUY tidak mengandung kata transaksi "STRONG BUY"/"BUY" mentah', () => {
    const message = formatMessage(alert, {
      stock: {
        price: 5000,
        scoring: { total_score: 82, kategori: 'STRONG BUY' },
      },
    });

    expect(message).not.toContain('STRONG BUY');
    expect(message).toContain('Konsensus Sangat Positif');
    expect(message).toContain('SINYAL SANGAT POSITIF');
  });
});
