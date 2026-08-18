import { describe, expect, it } from 'vitest';
import { classifyTradingBoard } from '../idx-trading-board';
import { getEmitenBoard, loadEmitenList } from '@/shared/market/emiten-list';

describe('classifyTradingBoard', () => {
  it('memetakan setiap nilai listing_board IDX yang ada di all.csv', () => {
    expect(classifyTradingBoard('Utama')?.board).toBe('MAIN');
    expect(classifyTradingBoard('Pengembangan')?.board).toBe('DEVELOPMENT');
    expect(classifyTradingBoard('Akselerasi')?.board).toBe('ACCELERATION');
    expect(classifyTradingBoard('Ekonomi Baru')?.board).toBe('NEW_ECONOMY');
    expect(classifyTradingBoard('Pemantauan Khusus')?.board).toBe('WATCHLIST_FCA');
  });

  it('hanya Papan Pemantauan Khusus yang berstatus FCA / Periodic Call Auction', () => {
    const fca = classifyTradingBoard('Pemantauan Khusus')!;
    expect(fca.isFca).toBe(true);
    expect(fca.tradingMechanism).toContain('Periodic Call Auction');

    for (const board of ['Utama', 'Pengembangan', 'Akselerasi', 'Ekonomi Baru']) {
      const info = classifyTradingBoard(board)!;
      expect(info.isFca).toBe(false);
      expect(info.tradingMechanism).toContain('Continuous Auction');
    }
  });

  it('toleran terhadap spasi dan besar-kecil huruf', () => {
    expect(classifyTradingBoard('  pemantauan khusus  ')?.board).toBe('WATCHLIST_FCA');
    expect(classifyTradingBoard('UTAMA')?.board).toBe('MAIN');
  });

  // Inti temuan C-01: tidak ada papan tebakan. Versi lama mengembalikan
  // 'DEVELOPMENT' untuk apa pun yang tidak ada di tiga himpunan ketikan tangan,
  // sehingga 224 emiten Papan Utama dilabeli "Papan Pengembangan" sebagai fakta.
  it('mengembalikan null untuk masukan kosong, tidak jatuh ke papan default', () => {
    expect(classifyTradingBoard(null)).toBeNull();
    expect(classifyTradingBoard(undefined)).toBeNull();
    expect(classifyTradingBoard('')).toBeNull();
  });

  it('mengembalikan null untuk nama papan yang belum dikenal, bukan menebak', () => {
    expect(classifyTradingBoard('Papan Yang Belum Ada')).toBeNull();
  });
});

describe('papan diturunkan dari all.csv, bukan daftar ketikan tangan', () => {
  // Empat emiten ini ada di WATCHLIST_FCA_TICKERS versi lama padahal Papan Utama,
  // sehingga UI memberi mereka peringatan "Periodic Call Auction 5 sesi lelang/hari"
  // yang tidak berlaku. Uji ini gagal kalau regresi itu kembali.
  it.each(['BUMI', 'DEWA', 'ENRG', 'BRMS'])(
    '%s adalah Papan Utama dan bukan FCA',
    (symbol) => {
      const info = classifyTradingBoard(getEmitenBoard(symbol));
      expect(info?.board).toBe('MAIN');
      expect(info?.isFca).toBe(false);
    },
  );

  it('GOTO memakai papan dari CSV, bukan FCA seperti daftar lama', () => {
    const info = classifyTradingBoard(getEmitenBoard('GOTO.JK'));
    expect(info?.isFca).toBe(false);
  });

  it('emiten yang tidak ada di master (mis. sudah delisting) tidak dapat lencana', () => {
    // MYRX masih tercantum di WATCHLIST_FCA_TICKERS lama walau tidak ada di all.csv.
    expect(getEmitenBoard('MYRX')).toBeNull();
    expect(classifyTradingBoard(getEmitenBoard('MYRX'))).toBeNull();
  });

  it('indeks bukan emiten dan tidak punya papan', () => {
    expect(classifyTradingBoard(getEmitenBoard('^JKSE'))).toBeNull();
  });

  it('setiap listing_board di all.csv dapat dipetakan - tidak ada papan yang diam-diam hilang', () => {
    const unmapped = [
      ...new Set(
        loadEmitenList()
          .map((e) => e.board)
          .filter((board) => board && classifyTradingBoard(board) === null),
      ),
    ];
    expect(unmapped).toEqual([]);
  });
});
