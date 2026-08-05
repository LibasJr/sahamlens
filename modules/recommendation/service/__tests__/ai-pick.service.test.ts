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

// REWRITE (audit skor 2026-08-05, kasus BJBR skor 97): lapisan bonus lama menambahkan poin
// mentah di atas skor yang SUDAH dinormalisasi 0-100, menghasilkan rentang 0-140 yang
// dilaporkan ke pengguna seolah 0-100. Sekarang breakout/golden cross/akumulasi jadi TAG
// (ditampilkan + tie-break), bukan poin. Lihat komentar lengkap di ai-pick.service.ts.
describe('rankAiPicks', () => {
  it('skor akhir TIDAK PERNAH melebihi 100 walau semua sinyal muncul sekaligus', () => {
    const scored = [stock('AAAA.JK', 95, { rsi: 25, accumulationConfirmed: true })];
    const breakout: BreakoutInfo = { breakoutSymbols: ['AAAA.JK'], goldenCrossSymbols: ['AAAA.JK'], deadCrossSymbols: [] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result[0].finalScore).toBe(95);
    expect(result[0].finalScore).toBeLessThanOrEqual(100);
  });

  it('skor akhir sama persis dengan skor dasar - sinyal tidak menambah poin', () => {
    const scored = [stock('AAAA.JK', 75), stock('BBBB.JK', 65)];
    const breakout: BreakoutInfo = { breakoutSymbols: ['BBBB.JK'], goldenCrossSymbols: [], deadCrossSymbols: [] };

    const result = rankAiPicks(scored, breakout, []);

    // Skor dasar 75 tetap di atas 65 - breakout tidak lagi membalik peringkat.
    expect(result[0].symbol).toBe('AAAA.JK');
    expect(result[0].finalScore).toBe(75);
    expect(result[1].finalScore).toBe(65);
    expect(result[1].baseScore).toBe(65);
  });

  it('sinyal dicatat sebagai tag yang bisa ditelusuri, bukan poin', () => {
    const scored = [stock('AAAA.JK', 80, { accumulationConfirmed: true })];
    const breakout: BreakoutInfo = { breakoutSymbols: ['AAAA.JK'], goldenCrossSymbols: ['AAAA.JK'], deadCrossSymbols: [] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result[0].signals).toEqual(['breakout', 'golden cross', 'akumulasi']);
    expect(result[0].finalScore).toBe(80);
  });

  it('akumulasi TIDAK jadi tag terpisah kalau tidak terkonfirmasi', () => {
    const scored = [stock('AAAA.JK', 80, { accumulationConfirmed: false })];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result[0].signals).toEqual([]);
  });

  it('RSI oversold tidak lagi jadi sinyal - skor dasar sudah menilainya sebagai zona hati-hati', () => {
    const scored = [stock('AAAA.JK', 70, { rsi: 25 })];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result[0].signals).toEqual([]);
    expect(result[0].finalScore).toBe(70);
  });

  it('skor sama diurutkan menurut jumlah sinyal dulu, baru simbol', () => {
    const scored = [stock('ZZZZ.JK', 70), stock('AAAA.JK', 70), stock('MMMM.JK', 70)];
    const breakout: BreakoutInfo = { breakoutSymbols: ['MMMM.JK'], goldenCrossSymbols: [], deadCrossSymbols: [] };

    const result = rankAiPicks(scored, breakout, []);

    // MMMM punya 1 sinyal jadi naik; sisanya (0 sinyal) urut alfabetis.
    expect(result.map((r) => r.symbol)).toEqual(['MMMM.JK', 'AAAA.JK', 'ZZZZ.JK']);
  });

  it('skor dasar sama TANPA sinyal apa pun diurutkan menurut simbol, bukan urutan array masukan', () => {
    const scored = [stock('ZZZZ.JK', 70), stock('AAAA.JK', 70), stock('MMMM.JK', 70)];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result.map((r) => r.symbol)).toEqual(['AAAA.JK', 'MMMM.JK', 'ZZZZ.JK']);
  });

  it('saham di bawah ambang BUY tidak bisa lagi diangkat masuk daftar oleh sinyal', () => {
    // Skor dasar 45 = kategori HOLD/SELL menurut getKategori(). Dulu 45 + bonus breakout 15
    // = 60 sehingga LOLOS ambang, melanggar aturan yang ditulis di file itu sendiri
    // ("daftar hari ini beli apa tidak boleh memuat saham yang sistem sendiri tidak
    // kategorikan layak beli").
    const scored = [stock('AAAA.JK', 80), stock('BBBB.JK', 45)];
    const breakout: BreakoutInfo = { breakoutSymbols: ['BBBB.JK'], goldenCrossSymbols: ['BBBB.JK'], deadCrossSymbols: [] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result.map((r) => r.symbol)).toEqual(['AAAA.JK']);
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

  it('dead cross menandai merah tanpa mengurangi skor', () => {
    const scored = [stock('AAAA.JK', 70)];
    const breakout: BreakoutInfo = { breakoutSymbols: [], goldenCrossSymbols: [], deadCrossSymbols: ['AAAA.JK'] };

    const result = rankAiPicks(scored, breakout, []);

    expect(result[0].finalScore).toBe(70);
    expect(result[0].flagged).toBe(true);
    expect(result[0].flagReason).toBe('dead cross');
  });

  it('cache breakout kosong menghasilkan peringkat tanpa sinyal, bukan error', () => {
    const scored = [stock('AAAA.JK', 80), stock('BBBB.JK', 70)];

    const result = rankAiPicks(scored, { breakoutSymbols: [], goldenCrossSymbols: [], deadCrossSymbols: [] }, []);

    expect(result).toHaveLength(2);
    expect(result[0].signals).toEqual([]);
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
    expect(result[0].signals).toEqual([]);
  });

  it('coverage diteruskan apa adanya supaya UI bisa menyatakan kelengkapan data', () => {
    const scored = [stock('AAAA.JK', 82, { coverage: 90 })];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result[0].coverage).toBe(90);
  });

  it('coverage null untuk entri cache lama yang belum punya field ini', () => {
    const scored = [stock('AAAA.JK', 82)]; // coverage tidak di-set

    const result = rankAiPicks(scored, noSignals, []);

    expect(result[0].coverage).toBeNull();
  });

  it('TP1/TP2/CL1/CL2 dihitung dari harga +/- 1x/2x ATR, keduanya sekaligus bukan salah satu', () => {
    const scored = [stock('AAAA.JK', 80, { price: 1000, atr: 50 })];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result[0].tp1).toBe(1050);
    expect(result[0].tp2).toBe(1100);
    expect(result[0].cl1).toBe(950);
    expect(result[0].cl2).toBe(900);
  });

  it('TP/CL null kalau ATR belum tersedia (cache lama sebelum field ini ada)', () => {
    const scored = [stock('AAAA.JK', 80)]; // atr tidak di-set (undefined)

    const result = rankAiPicks(scored, noSignals, []);

    expect(result[0].tp1).toBeNull();
    expect(result[0].tp2).toBeNull();
    expect(result[0].cl1).toBeNull();
    expect(result[0].cl2).toBeNull();
  });
});
