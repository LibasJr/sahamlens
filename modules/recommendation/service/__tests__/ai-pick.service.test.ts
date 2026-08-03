import { describe, it, expect } from 'vitest';
import { rankAiPicks, type ScoredStock, type BreakoutInfo } from '../ai-pick.service';

function stock(symbol: string, totalScore: number, extra: Partial<ScoredStock> = {}): ScoredStock {
  return {
    symbol, price: 1000, changePct: 0, totalScore, rsi: 50, accumulationConfirmed: false,
    breakdown: { technical: 0, fundamental: 0, flow: 0 }, topReasons: [],
    ...extra,
  };
}

const noSignals: BreakoutInfo = { breakoutSymbols: [], goldenCrossSymbols: [], deadCrossSymbols: [] };

describe('rankAiPicks', () => {
  it('bonus breakout mengangkat saham di atas skor dasar yang lebih tinggi', () => {
    const scored = [stock('AAAA.JK', 75), stock('BBBB.JK', 65)];
    const breakout: BreakoutInfo = { breakoutSymbols: ['BBBB.JK'], goldenCrossSymbols: [], deadCrossSymbols: [] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result[0].symbol).toBe('BBBB.JK');
    expect(result[0].finalScore).toBe(80); // 65 + 15
    expect(result[1].finalScore).toBe(75);
  });

  it('skor dasar sama diurutkan menurut simbol, bukan urutan array masukan', () => {
    const scored = [stock('ZZZZ.JK', 70), stock('AAAA.JK', 70), stock('MMMM.JK', 70)];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result.map((r) => r.symbol)).toEqual(['AAAA.JK', 'MMMM.JK', 'ZZZZ.JK']);
  });

  it('saham bertanda merah tetap muncul di daftar, tidak disaring keluar', () => {
    const scored = [stock('AAAA.JK', 80)];

    const result = rankAiPicks(scored, noSignals, ['AAAA.JK']);

    expect(result).toHaveLength(1);
    expect(result[0].flagged).toBe(true);
    expect(result[0].flagReason).toBe('teknikal bearish');
  });

  it('skor akhir di bawah 60 dibuang meski daftar jadi kurang dari 10', () => {
    const scored = [stock('AAAA.JK', 80), stock('BBBB.JK', 59), stock('CCCC.JK', 45)];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result.map((r) => r.symbol)).toEqual(['AAAA.JK']);
  });

  it('semua di bawah ambang menghasilkan daftar kosong, bukan yang terbaik dari yang buruk', () => {
    const scored = [stock('AAAA.JK', 55), stock('BBBB.JK', 50)];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result).toEqual([]);
  });

  it('daftar dipotong 10 teratas', () => {
    const scored = Array.from({ length: 15 }, (_, i) => stock(`S${String(i).padStart(2, '0')}.JK`, 100 - i));

    const result = rankAiPicks(scored, noSignals, []);

    expect(result).toHaveLength(10);
    expect(result[0].symbol).toBe('S00.JK');
  });

  it('bonus ditumpuk dan dirinci supaya asal skor bisa ditelusuri', () => {
    const scored = [stock('AAAA.JK', 60, { rsi: 25, accumulationConfirmed: true })];
    const breakout: BreakoutInfo = { breakoutSymbols: ['AAAA.JK'], goldenCrossSymbols: ['AAAA.JK'], deadCrossSymbols: [] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result[0].finalScore).toBe(100); // 60 +15 +10 +10 +5
    expect(result[0].bonuses).toEqual([
      { label: 'breakout', points: 15 },
      { label: 'akumulasi', points: 10 },
      { label: 'golden cross', points: 10 },
      { label: 'oversold', points: 5 },
    ]);
  });

  it('dead cross menandai merah tanpa mengurangi skor', () => {
    const scored = [stock('AAAA.JK', 70)];
    const breakout: BreakoutInfo = { breakoutSymbols: [], goldenCrossSymbols: [], deadCrossSymbols: ['AAAA.JK'] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result[0].finalScore).toBe(70);
    expect(result[0].flagged).toBe(true);
    expect(result[0].flagReason).toBe('dead cross');
  });

  it('cache breakout kosong menghasilkan peringkat tanpa bonus, bukan error', () => {
    const scored = [stock('AAAA.JK', 80), stock('BBBB.JK', 70)];

    const result = rankAiPicks(scored, { breakoutSymbols: [], goldenCrossSymbols: [], deadCrossSymbols: [] }, []);

    expect(result).toHaveLength(2);
    expect(result[0].bonuses).toEqual([]);
    expect(result[0].finalScore).toBe(80);
  });

  it('simbol yang hanya ada di cache breakout tidak membuat hasil gagal', () => {
    const scored = [stock('AAAA.JK', 80)];
    const breakout: BreakoutInfo = {
      breakoutSymbols: ['TIDAKADA.JK'],
      goldenCrossSymbols: ['JUGATIDAK.JK'],
      deadCrossSymbols: [],
    };

    const result = rankAiPicks(scored, breakout, []);

    expect(result.map((r) => r.symbol)).toEqual(['AAAA.JK']);
    expect(result[0].bonuses).toEqual([]);
  });
});
