import { describe, it, expect } from 'vitest';
import { rankAiPicks, type ScoredStock, type BreakoutInfo } from '../ai-pick.service';

// P0-1: `kategori` & `eligibilityStatus` default DIISI di sini supaya test-test lama di
// bawah tetap menguji hal yang mereka maksud (pemeringkatan, tag sinyal, TP/CL). Entri
// tanpa kedua field itu sekarang DIKELUARKAN dari daftar secara sengaja - perilaku itu
// diuji terpisah di blok "P0-1" di bawah, bukan tercampur ke sini.
function stock(symbol: string, totalScore: number, extra: Partial<ScoredStock> = {}): ScoredStock {
  return {
    symbol, price: 1000, changePct: 0, totalScore, rsi: 50, accumulationConfirmed: false,
    breakdown: { technical: 0, fundamental: 0, flow: 0 }, topReasons: [],
    kategori: 'BUY', eligibilityStatus: 'ELIGIBLE', coverage: 100,
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

  it('coverage null diteruskan apa adanya kalau kategori-nya sudah diketahui', () => {
    // Entri yang punya `kategori` tidak perlu menurunkan status dari coverage, jadi
    // coverage null di sini bukan alasan mengeluarkannya - ia cuma tidak ditampilkan.
    const scored = [stock('AAAA.JK', 82, { coverage: null })];

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

// P0-1 (blueprint quant V2 §2): rankAiPicks() dulu HANYA menyaring `finalScore >=
// MIN_SCORE`. `coverage` dibawa sampai item tapi tidak pernah dievaluasi, dan `kategori`
// tidak pernah ikut dibawa sama sekali - `ScoredStock` tidak punya field-nya. Akibatnya
// saham yang calculateScore() sendiri nilai 'DATA TIDAK CUKUP' (mis. fundamental & flow
// kosong, hanya teknikal) bisa mendapat total_score mendekati 100 karena renormalisasi,
// lalu menempati peringkat teratas daftar "hari ini beli apa".
describe('rankAiPicks - P0-1 saham berdata tidak cukup tidak pernah masuk daftar', () => {
  it("kategori 'DATA TIDAK CUKUP' dikeluarkan meski skornya 95", () => {
    const scored = [
      stock('AAAA.JK', 95, { kategori: 'DATA TIDAK CUKUP', coverage: 40 }),
      stock('BBBB.JK', 62, { kategori: 'BUY' }),
    ];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result.map((r) => r.symbol)).toEqual(['BBBB.JK']);
  });

  it('dikeluarkan, BUKAN diberi peringkat rendah - tidak muncul di posisi manapun', () => {
    const scored = [stock('AAAA.JK', 99, { kategori: 'DATA TIDAK CUKUP', coverage: 30 })];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result).toEqual([]);
  });

  it('entri cache lama tanpa `kategori`: status diturunkan ulang dari coverage < 55', () => {
    const scored = [{ ...stock('AAAA.JK', 90), kategori: undefined, coverage: 40 }];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result).toEqual([]);
  });

  it('entri cache lama tanpa `kategori` dengan coverage memadai tetap lolos', () => {
    const scored = [{ ...stock('AAAA.JK', 90), kategori: undefined, coverage: 80 }];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result.map((r) => r.symbol)).toEqual(['AAAA.JK']);
  });

  it('entri sangat lama tanpa `kategori` DAN tanpa `coverage` dikeluarkan (fail-closed)', () => {
    const scored = [{ ...stock('AAAA.JK', 90), kategori: undefined, coverage: undefined }];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result).toEqual([]);
  });

  it('coverage NaN diperlakukan sebagai tidak diketahui, bukan angka (fail-closed)', () => {
    const scored = [{ ...stock('AAAA.JK', 90), kategori: undefined, coverage: NaN }];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result).toEqual([]);
  });

  it('kategori BUY dengan skor 60 tetap muncul', () => {
    const scored = [stock('AAAA.JK', 60, { kategori: 'BUY' })];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result).toHaveLength(1);
    expect(result[0].kategori).toBe('BUY');
  });

  it('seluruh universe berdata tidak cukup => daftar kosong, tidak melempar', () => {
    const scored = Array.from({ length: 20 }, (_, i) =>
      stock(`S${i}.JK`, 90, { kategori: 'DATA TIDAK CUKUP', coverage: 40 })
    );

    expect(() => rankAiPicks(scored, noSignals, [])).not.toThrow();
    expect(rankAiPicks(scored, noSignals, [])).toEqual([]);
  });

  it('masukan bukan array (cache rusak) menghasilkan daftar kosong, bukan crash', () => {
    expect(rankAiPicks(null as unknown as ScoredStock[], noSignals, [])).toEqual([]);
    expect(rankAiPicks(undefined as unknown as ScoredStock[], noSignals, [])).toEqual([]);
  });
});

// P0-3: gerbang kelayakan minimal. Saham tidak likuid / kemungkinan tidak diperdagangkan
// / data basi / histori kurang TIDAK boleh masuk daftar advisory berapa pun skornya.
describe('rankAiPicks - P0-3 hanya saham ELIGIBLE yang boleh direkomendasikan', () => {
  it.each([
    'LOW_LIQUIDITY',
    'POSSIBLY_NOT_TRADED',
    'STALE_DATA',
    'INSUFFICIENT_HISTORY',
    'INSUFFICIENT_DATA',
  ] as const)('status %s dikeluarkan walau skornya 98', (status) => {
    const scored = [stock('AAAA.JK', 98, { eligibilityStatus: status })];

    expect(rankAiPicks(scored, noSignals, [])).toEqual([]);
  });

  it('entri cache lama tanpa `eligibilityStatus` dikeluarkan (fail-closed)', () => {
    const scored = [{ ...stock('AAAA.JK', 90), eligibilityStatus: undefined }];

    expect(rankAiPicks(scored, noSignals, [])).toEqual([]);
  });

  it('ACCEPTANCE: tidak ada satu pun item hasil yang coverage < 55 atau DATA TIDAK CUKUP', () => {
    // Campuran padat: layak, tidak layak, entri lama, coverage di sekitar ambang.
    const scored: ScoredStock[] = [
      stock('A.JK', 92, { coverage: 100 }),
      stock('B.JK', 88, { coverage: 54, kategori: 'DATA TIDAK CUKUP' }),
      stock('C.JK', 85, { coverage: 55 }),
      stock('D.JK', 99, { eligibilityStatus: 'LOW_LIQUIDITY' }),
      { ...stock('E.JK', 91), kategori: undefined, coverage: 20 },
      { ...stock('F.JK', 91), kategori: undefined, coverage: undefined },
      { ...stock('G.JK', 77), eligibilityStatus: undefined },
      stock('H.JK', 70, { coverage: 61 }),
    ];

    const result = rankAiPicks(scored, noSignals, []);

    expect(result.map((r) => r.symbol)).toEqual(['A.JK', 'C.JK', 'H.JK']);
    for (const item of result) {
      expect(item.kategori).not.toBe('DATA TIDAK CUKUP');
      expect(item.coverage === null || item.coverage >= 55).toBe(true);
    }
  });

  it('sinyal breakout TIDAK bisa mengangkat saham tidak layak masuk daftar', () => {
    const scored = [stock('AAAA.JK', 90, { eligibilityStatus: 'LOW_LIQUIDITY', accumulationConfirmed: true })];
    const breakout: BreakoutInfo = {
      breakoutSymbols: ['AAAA.JK'], goldenCrossSymbols: ['AAAA.JK'], deadCrossSymbols: [],
    };

    expect(rankAiPicks(scored, breakout, [])).toEqual([]);
  });
});
