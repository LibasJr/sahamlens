import { describe, expect, it } from 'vitest';
import { formatMessage, isTriggered } from '../alert-evaluation.service';

const alert = { condition_type: 'CONSENSUS_STRONG_BUY', condition_value: null };

function stock(decision?: any, consensus = 'STRONG BUY') {
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
