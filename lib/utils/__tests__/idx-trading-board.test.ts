import { describe, expect, it } from 'vitest';
import { classifyTradingBoard } from '../idx-trading-board';

describe('classifyTradingBoard', () => {
  it('mengidentifikasi Papan Utama untuk emiten besar (BBCA, BBRI, TLKM)', () => {
    const bbca = classifyTradingBoard('BBCA.JK');
    expect(bbca.board).toBe('MAIN');
    expect(bbca.isFca).toBe(false);
    expect(bbca.shortLabel).toBe('Papan Utama');
  });

  it('mengidentifikasi Papan Pemantauan Khusus (FCA) dan memberikan flag isFca', () => {
    const goto = classifyTradingBoard('GOTO');
    expect(goto.board).toBe('WATCHLIST_FCA');
    expect(goto.isFca).toBe(true);
    expect(goto.tradingMechanism).toContain('Periodic Call Auction');
  });

  it('mengidentifikasi Papan Akselerasi', () => {
    const runs = classifyTradingBoard('RUNS.JK');
    expect(runs.board).toBe('ACCELERATION');
    expect(runs.isFca).toBe(false);
  });

  it('default ke Papan Pengembangan untuk emiten lain', () => {
    const random = classifyTradingBoard('ABCD.JK');
    expect(random.board).toBe('DEVELOPMENT');
    expect(random.isFca).toBe(false);
  });
});
