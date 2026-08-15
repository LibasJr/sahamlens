import { describe, expect, it } from 'vitest';
import { calculateChatQuestion } from '../chat-calculator';

describe('kalkulator deterministik LensAI', () => {
  it('menghitung ukuran posisi, lot, dan risk/reward tanpa model bahasa', () => {
    const result = calculateChatQuestion('modal 10 juta, risiko 1%, entry 2.000, stop loss 1.900, target 2.300. Position size berapa?');
    expect(result?.kind).toBe('POSITION_SIZE');
    expect(result?.content).toContain('10 lot');
    expect(result?.content).toContain('1:3');
  });

  it('menghitung lot pembelian sebelum biaya broker', () => {
    const result = calculateChatQuestion('modal 10 juta harga 2.500 bisa beli berapa lot?');
    expect(result?.kind).toBe('LOTS');
    expect(result?.content).toContain('40 lot');
  });

  it('menghitung compounding dari modal, return, dan tahun', () => {
    const result = calculateChatQuestion('simulasi compounding modal 10 juta return 10% selama 2 tahun');
    expect(result?.kind).toBe('COMPOUNDING');
    expect(result?.content).toContain('Rp12.100.000');
  });

  it('menghitung margin of safety dari harga dan nilai wajar', () => {
    const result = calculateChatQuestion('margin of safety harga 800 nilai wajar 1000 berapa?');
    expect(result?.kind).toBe('MARGIN_OF_SAFETY');
    expect(result?.content).toContain('20%');
  });
});
