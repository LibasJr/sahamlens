import { describe, it, expect } from 'vitest';
import { findFabricatedNumbers } from '../council.service';

// DATA REAL yang dikirim ke model - bentuknya sama dengan `promptData` di getCouncil().
const promptData = {
  price: 23900,
  ma50: 23743,
  ma200: 26832,
  ema: 23800,
  rsi: 45.2,
  support: 23000,
  resistance: 24500,
  atr: 500,
  volRatio: '1.20',
  foreignFlow: 'NET BUY',
  score: 62,
  eps: 2500,
  lastQuarter: '2026-03-31',
};

describe('findFabricatedNumbers', () => {
  // Kasus produksi sesungguhnya (log Vercel 2026-08-05, UNTR.JK): jawaban AI ini BENAR -
  // 23743 dan 26832 dua-duanya ada di DATA REAL - tapi dulu ditolak karena "200" terbaca
  // dari nama indikator "MA200". Praktis semua analisis tren menyebut MA200, jadi bug ini
  // membuat hampir SETIAP panggilan Council jatuh ke fallback lokal.
  it('menerima jawaban yang menyebut MA200 - angka itu nama indikator, bukan harga', () => {
    const json = { agents: [{ name: 'Trend Follower', signal: 'SELL', reason: 'MA50 23743 < MA200 26832' }] };

    expect(findFabricatedNumbers(json, promptData)).toBeNull();
  });

  it('menerima variasi penulisan periode indikator yang nempel tanpa spasi', () => {
    const json = {
      b: 'ATR-14 melebar',
      c: 'Cek RSI14 dan CMF20 dulu',
      d: 'SMA200 jadi resistance',
    };

    expect(findFabricatedNumbers(json, promptData)).toBeNull();
  });

  // Kasus produksi sesungguhnya kedua (log Vercel 2026-08-05, BBCA.JK, PUTARAN KE-2):
  // versi pertama perbaikan MA200 di atas terlalu rakus - ikut membolehkan spasi antara
  // nama indikator dan angka, jadi "ATR 158.9" (AI melaporkan NILAI ATR asli dari DATA
  // REAL) ikut ke-strip seolah itu notasi periode, meninggalkan angka acak yang pasti
  // ditolak. Notasi periode di kenyataan SELALU nempel tanpa spasi (MA200, RSI14) -
  // "ATR 158.9" (ada spasi) itu laporan nilai, harus tetap dicek sebagai angka biasa.
  it('nilai indikator yang ditulis dengan spasi TETAP dicek sebagai angka (bukan periode)', () => {
    const jsonValid = { summary_id: 'ATR 500 tinggi, waspada.' }; // 500 = promptData.atr asli
    expect(findFabricatedNumbers(jsonValid, promptData)).toBeNull();

    const jsonInvalid = { summary_id: 'ATR 99999 tinggi, waspada.' }; // karangan
    expect(findFabricatedNumbers(jsonInvalid, promptData)).not.toBeNull();
  });

  it('menerima angka yang memang ada di DATA REAL', () => {
    const json = { summary_id: 'Harga 23900, support 23000, resistance 24500.' };

    expect(findFabricatedNumbers(json, promptData)).toBeNull();
  });

  it('menerima level turunan wajar: harga +/- ATR', () => {
    // 23900 + 500 = 24400, 23900 - 500 = 23400 - keduanya hitungan sah dari data.
    const json = { summary_id: 'Target 24400, cut loss 23400.' };

    expect(findFabricatedNumbers(json, promptData)).toBeNull();
  });

  // Penjaga HARUS tetap menangkap karangan sesungguhnya - perbaikan di atas tidak boleh
  // melemahkan tujuan aslinya (temuan C-6: model gratis mengarang level harga).
  it('TETAP menolak level harga yang tidak ada di DATA REAL', () => {
    const json = { summary_id: 'Beli di 19500, target 31000.' };

    const violation = findFabricatedNumbers(json, promptData);
    expect(violation).not.toBeNull();
    expect(violation).toContain('19500');
  });

  it('TETAP menolak karangan walau ditulis dengan pemisah ribuan gaya Indonesia', () => {
    const json = { summary_id: 'Harga wajar Rp 19.500 per saham.' };

    expect(findFabricatedNumbers(json, promptData)).not.toBeNull();
  });

  it('angka yang menempel di nama indikator tidak dipakai membenarkan harga karangan', () => {
    // "MA200" dinetralkan, tapi 19500 di kalimat yang sama tetap harus ketahuan.
    const json = { summary_id: 'MA200 ketembus, incar 19500.' };

    expect(findFabricatedNumbers(json, promptData)).not.toBeNull();
  });

  it('angka kecil (persen/rasio/jumlah agent) tetap diloloskan', () => {
    const json = { summary_id: '6 BUY 4 WAIT, RR 1:4.33, risk 2.14%.' };

    expect(findFabricatedNumbers(json, promptData)).toBeNull();
  });

  // Kasus produksi sesungguhnya kedua (log Vercel 2026-08-05, UNTR.JK): rentang harga
  // ditulis dengan tanda hubung ("23850-24545") dulu terbaca sebagai "-24545" (angka
  // negatif) karena `-?` di depan regex menelan tanda hubung pemisah rentang sebagai
  // minus. Harga saham tidak pernah negatif, jadi SETIAP rentang harga pasti ditolak.
  it('menerima rentang harga yang ditulis dengan tanda hubung, bukan dibaca minus', () => {
    const json = { summary_id: 'Pantulan ke 23850-24545 mungkin terjadi.' };

    expect(findFabricatedNumbers(json, promptData)).toBeNull();
  });

  it('tetap menangkap minus asli (mis. MACD histogram negatif)', () => {
    const json = { summary_id: 'MACD Hist:-999.50 bearish kuat.' };

    const violation = findFabricatedNumbers(json, promptData);
    expect(violation).not.toBeNull();
    expect(violation).toContain('-999.5');
  });
});
