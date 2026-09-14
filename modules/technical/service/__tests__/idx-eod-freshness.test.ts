import { describe, expect, it } from 'vitest';
import {
  assessIdxEodFreshness,
  countTradingDaysBetween,
  jakartaDateKey,
  IDX_EOD_STALENESS_TRADING_DAYS,
} from '../idx-eod-freshness.service';

/** Waktu Jakarta -> Date. */
function wib(dateKey: string, hhmm = '10:00'): Date {
  return new Date(`${dateKey}T${hhmm}:00+07:00`);
}

describe('jakartaDateKey', () => {
  it('memakai zona bursa, bukan UTC', () => {
    // 2026-09-14T17:00:00Z adalah 15 September pukul 00:00 WIB.
    expect(jakartaDateKey(new Date('2026-09-14T17:00:00Z'))).toBe('2026-09-15');
  });

  it('sore WIB tetap tanggal yang sama', () => {
    expect(jakartaDateKey(wib('2026-09-11', '16:30'))).toBe('2026-09-11');
  });
});

describe('countTradingDaysBetween', () => {
  it('akhir pekan tidak dihitung', () => {
    // Jumat 11 Sep -> Senin 14 Sep. Sabtu & Minggu bukan hari bursa.
    expect(countTradingDaysBetween('2026-09-11', wib('2026-09-14'))).toBe(1);
  });

  it('hari bursa berturut-turut dihitung satu per satu', () => {
    // Kamis 10 -> Jumat 11.
    expect(countTradingDaysBetween('2026-09-10', wib('2026-09-11'))).toBe(1);
  });

  it('hari yang sama berarti nol', () => {
    expect(countTradingDaysBetween('2026-09-11', wib('2026-09-11'))).toBe(0);
  });

  it('akhir pekan penuh dari Jumat ke Minggu tetap nol', () => {
    expect(countTradingDaysBetween('2026-09-11', wib('2026-09-13'))).toBe(0);
  });
});

describe('assessIdxEodFreshness', () => {
  // Inti penjaga ini: Senin pagi adalah keadaan NORMAL, bukan alarm.
  it('SENIN pagi dengan artefak Jumat = FRESH', () => {
    const r = assessIdxEodFreshness('2026-09-11', wib('2026-09-14', '08:43'));

    expect(r.freshness).toBe('FRESH');
    expect(r.tradingDaysBehind).toBe(1);
    expect(r.reason).toBeNull();
  });

  it('sesi berjalan dengan artefak hari bursa sebelumnya = FRESH', () => {
    // Sync jalan 17:30 WIB, jadi siang hari artefak memang menunjuk kemarin.
    const r = assessIdxEodFreshness('2026-09-10', wib('2026-09-11', '11:00'));
    expect(r.freshness).toBe('FRESH');
  });

  it('artefak hari ini = FRESH', () => {
    const r = assessIdxEodFreshness('2026-09-11', wib('2026-09-11', '18:00'));
    expect(r.tradingDaysBehind).toBe(0);
    expect(r.freshness).toBe('FRESH');
  });

  it('tertinggal dua hari bursa = STALE', () => {
    // Artefak Rabu 9, sekarang Jumat 11: Kamis + Jumat = 2 hari bursa.
    const r = assessIdxEodFreshness('2026-09-09', wib('2026-09-11'));

    expect(r.freshness).toBe('STALE');
    expect(r.tradingDaysBehind).toBe(2);
    expect(r.reason).toContain('tertinggal 2 hari bursa');
  });

  it('alasan STALE menyebut unit sinkronisasi yang harus diperiksa', () => {
    const r = assessIdxEodFreshness('2026-09-01', wib('2026-09-11'));
    // Alarm tanpa petunjuk tindakan akan diabaikan.
    expect(r.reason).toContain('sahamlens-idx-flow-sync.timer');
  });

  it('macet seminggu terdeteksi jelas', () => {
    const r = assessIdxEodFreshness('2026-09-04', wib('2026-09-11'));
    expect(r.freshness).toBe('STALE');
    expect(r.tradingDaysBehind).toBeGreaterThanOrEqual(4);
  });

  it('menerima timestamp penuh, bukan hanya kunci tanggal', () => {
    const r = assessIdxEodFreshness('2026-09-11T09:00:00.000Z', wib('2026-09-14'));
    expect(r.latestTradeDate).toBe('2026-09-11');
    expect(r.freshness).toBe('FRESH');
  });

  it('toleransi bisa diperketat lewat argumen', () => {
    const r = assessIdxEodFreshness('2026-09-11', wib('2026-09-14'), 0);
    expect(r.freshness).toBe('STALE');
  });

  it('toleransi bawaan adalah satu hari bursa', () => {
    expect(IDX_EOD_STALENESS_TRADING_DAYS).toBe(1);
  });

  it('artefak jauh tertinggal tidak membuat perhitungan meledak', () => {
    const r = assessIdxEodFreshness('2025-01-02', wib('2026-09-14'));
    expect(r.freshness).toBe('STALE');
    // Dibatasi 30 iterasi - angka pastinya tidak penting, statusnya yang penting.
    expect(r.tradingDaysBehind).toBeLessThanOrEqual(30);
  });
});

// ===========================================================================
// V2 butir 002 - tanggal EOD di masa depan tidak boleh lolos sebagai FRESH
// ===========================================================================
describe('002 - tanggal artefak EOD di masa depan', () => {
  const now = new Date('2026-09-14T10:00:00+07:00');

  it('SERANGAN: artefak bertanggal jauh di depan ditandai STALE, bukan FRESH', () => {
    // countTradingDaysBetween memajukan kursor lalu berhenti saat melewati hari
    // ini. Kalau tanggalnya sendiri sudah di depan, ia berhenti pada iterasi
    // pertama dan mengembalikan 0 - terbaca "tidak tertinggal" alias FRESH.
    const hasil = assessIdxEodFreshness('2026-10-01', now);
    expect(hasil.freshness).toBe('STALE');
    expect(hasil.reason).toContain('MASA DEPAN');
  });

  it('pergeseran satu hari di sekitar tengah malam TIDAK memerahkan gerbang', () => {
    // Kunci tanggal WIB bisa bergeser sehari kalau jam mesin sedikit meleset.
    // Gerbang yang memerah untuk itu akan diabaikan.
    const besok = assessIdxEodFreshness('2026-09-15', now);
    expect(besok.freshness).toBe('FRESH');
  });

  it('tanggal hari ini tetap FRESH', () => {
    expect(assessIdxEodFreshness('2026-09-14', now).freshness).toBe('FRESH');
  });
});
