import { describe, expect, it } from 'vitest';
import type { Alert, AlertConditionType } from '@/modules/watchlist';
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

function alertOf(condition_type: AlertConditionType, condition_value: number | null = null): Alert {
  return { ...alert, condition_type, condition_value };
}

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
    expect(isTriggered(alertOf('PRICE_ABOVE'), { stock: { price: 5000 } })).toBe(false);
  });

  it('mengabaikan harga dan RSI bertipe string dari payload eksternal', () => {
    expect(isTriggered(alertOf('PRICE_BELOW', 6000), { stock: { price: '5000' } })).toBe(false);

    expect(isTriggered(alertOf('RSI_OVERSOLD'), {
      stock: { analyzers: [{ label: 'RSI', raw: { rsi: '12' }, value: null }] },
    })).toBe(false);
  });

  it('BREAKOUT dan breadth hanya menerima angka finite', () => {
    expect(isTriggered(alertOf('BREAKOUT_SCORE_ABOVE', 6), { breakoutEntry: { score: '8' } })).toBe(false);
    expect(isTriggered(alertOf('BREAKOUT_SCORE_ABOVE', 6), { breakoutEntry: { score: 7 } })).toBe(true);

    expect(isTriggered(alertOf('BREADTH_ADVANCING_BELOW', 100), { breadth: { advancing: Number.NaN } })).toBe(false);
    expect(isTriggered(alertOf('BREADTH_ADVANCING_BELOW', 100), { breadth: { advancing: 80 } })).toBe(true);
  });
});

describe('LensScore alert fail-closed tanpa data dummy', () => {
  it('tidak memicu alert skor ketika LensScore tidak tersedia', () => {
    expect(isTriggered(
      alertOf('LENS_SCORE_ABOVE', 70),
      { stock: { trust: { score_confidence_pct: 80 } } },
    )).toBe(false);
  });

  it('tidak memicu alert skor ketika target kosong', () => {
    expect(isTriggered(
      alertOf('LENS_SCORE_ABOVE'),
      { stock: { scoring: { total_score: 88 } } },
    )).toBe(false);
  });

  it('memicu alert skor hanya dari nilai LensScore yang tersedia', () => {
    expect(isTriggered(
      alertOf('LENS_SCORE_ABOVE', 75),
      { stock: { scoring: { total_score: 81 } } },
    )).toBe(true);
  });

  it('tidak memicu alert confidence ketika confidence tidak tersedia', () => {
    expect(isTriggered(
      alertOf('LENS_CONFIDENCE_BELOW', 50),
      { stock: { scoring: { total_score: 81 } } },
    )).toBe(false);
  });

  it('memicu alert confidence hanya dari confidence asli di payload trust', () => {
    expect(isTriggered(
      alertOf('LENS_CONFIDENCE_BELOW', 60),
      { stock: { trust: { score_confidence_pct: 45 } } },
    )).toBe(true);
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
