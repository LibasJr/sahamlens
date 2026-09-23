import { describe, expect, it } from 'vitest';
import { parseFollowUps, FOLLOWUP_MARKER } from '../follow-ups';

// Klarifikasi sekarang menyertakan chip "TICKER - <pertanyaan asli>" (opsi A,
// insiden 2026-09-23: user ditanya sebut ticker tanpa cara cepat menjawab).
describe('clarify chips', () => {
  it('marker di akhir CLARIFICATION_PROMPT dipecah jadi chip dan dibuang dari teks', () => {
    const prompt = CLARIFICATION_PROMPT_SHORT();
    const chips = ['BBCA - bandingkan valuasi dengan kompetitornya', 'ADRO - bandingkan valuasi dengan kompetitornya', 'TLKM - bandingkan valuasi dengan kompetitornya'];
    const { text, followUps } = parseFollowUps(`${prompt}\n${FOLLOWUP_MARKER}${chips.join(' | ')}`);
    expect(followUps).toEqual(chips);
    expect(text).not.toContain('[[FOLLOWUP]]');
    expect(text).toContain('Boleh diperjelas');
  });

  it('pertanyaan panjang dipotong 80 karakter sehingga chip tetap di bawah batas 120', () => {
    const long = 'bandingkan valuasi dengan kompetitornya, analisis risiko teknikal mendalam, dan breakdown LensScore lengkap semua'.repeat(2);
    const topic = long.replace(/\s+/g, ' ').trim().slice(0, 80);
    const chip = `BBCA - ${topic}`;
    expect(chip.length).toBeLessThanOrEqual(120);
  });
});

function CLARIFICATION_PROMPT_SHORT() {
  return 'Boleh diperjelas sedikit? Saya belum menangkap yang kamu maksud.';
}

import { buildTickerChips } from '../follow-ups';

describe('buildTickerChips (dipakai jalur TICKER_REQUIRED juga)', () => {
  it('chips = TICKER - pertanyaan, <= 120 char', () => {
    const chips = buildTickerChips('bandingkan valuasi dengan kompetitornya, analisis risiko teknikal mendalam, dan breakdown LensScore');
    expect(chips).toHaveLength(3);
    expect(chips[0]).toMatch(/^BBCA - bandingkan valuasi/);
    for (const c of chips) expect(c.length).toBeLessThanOrEqual(120);
  });
});
