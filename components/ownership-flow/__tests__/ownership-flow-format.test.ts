import { describe, expect, it } from 'vitest';
import {
  formatObservedDate,
  formatPercent,
  formatPpCell,
  formatPpWithUnit,
  FRESHNESS_LABEL,
  TREND_LABEL,
} from '../ownership-flow-format';

// TEST PRESENTASI - menjaga tiga hal yang paling mudah salah di layar:
//
// 1. pp vs %      : +0,51 pp TIDAK BOLEH terbaca sebagai +0,51%
// 2. null vs 0    : "belum ada data" TIDAK BOLEH tampil sebagai 0
// 3. label        : tidak ada satu pun label transaksi (BELI/JUAL)

describe('formatPercent - persentase kepemilikan', () => {
  it('memakai simbol % dan dua desimal gaya id-ID', () => {
    expect(formatPercent(42.75)).toBe('42,75%');
    expect(formatPercent(57.25)).toBe('57,25%');
    expect(formatPercent(0)).toBe('0,00%');
    expect(formatPercent(100)).toBe('100,00%');
  });

  it('menampilkan tanda pisah untuk nilai yang tidak ada - BUKAN 0%', () => {
    // "0%" adalah klaim bahwa kepemilikannya nihil. Itu berbeda dari "kami tidak
    // punya angkanya", dan menyamakan keduanya adalah kebohongan di layar.
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(null)).not.toBe('0,00%');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('formatPpCell / formatPpWithUnit - PERUBAHAN kepemilikan', () => {
  it('memberi tanda + eksplisit untuk kenaikan', () => {
    expect(formatPpCell(0.51)).toBe('+0,51');
    expect(formatPpCell(1.32)).toBe('+1,32');
  });

  it('memakai tanda minus untuk penurunan', () => {
    expect(formatPpCell(-0.51)).toBe('-0,51');
  });

  it('TIDAK PERNAH memakai simbol % pada delta', () => {
    // Inti §36: 40% -> 41% adalah +1 pp, sedangkan perubahan relatifnya +2,5%.
    // Menuliskan delta dengan "%" membuat pembaca salah baca sebesar 2,5x pada
    // contoh itu.
    for (const value of [1, -1, 0.51, 12.5]) {
      expect(formatPpCell(value)).not.toContain('%');
      expect(formatPpWithUnit(value)).not.toContain('%');
    }
  });

  it('menyertakan satuan pp pada versi lengkap', () => {
    expect(formatPpWithUnit(0.51)).toBe('+0,51 pp');
    expect(formatPpWithUnit(-1.32)).toBe('-1,32 pp');
  });

  it('menampilkan tanda pisah - BUKAN 0,00 - ketika tidak ada pembanding', () => {
    // Ini pasangan layar dari aturan di computeDelta(): tidak adanya pembanding
    // bukan berarti kepemilikan tidak berubah.
    expect(formatPpCell(null)).toBe('—');
    expect(formatPpWithUnit(null)).toBe('—');
    expect(formatPpCell(null)).not.toBe('0,00');
    // Nol yang BENAR-BENAR terukur tetap ditampilkan sebagai nol.
    expect(formatPpCell(0)).toBe('0,00');
  });
});

describe('formatObservedDate', () => {
  it('menulis tanggal observasi dalam format Indonesia', () => {
    expect(formatObservedDate('2026-08-15')).toBe('15 Agu 2026');
    expect(formatObservedDate('2026-01-01')).toBe('1 Jan 2026');
  });

  it('tidak bergeser karena timezone server', () => {
    // Diformat lewat komponen UTC. Kalau memakai timezone lokal, server di UTC+X
    // bisa menampilkan tanggal H-1 untuk observasi yang sama.
    expect(formatObservedDate('2026-12-31')).toBe('31 Des 2026');
  });

  it('menyatakan ketiadaan data secara eksplisit', () => {
    expect(formatObservedDate(null)).toBe('Belum ada data');
  });
});

describe('label tren & kesegaran', () => {
  it('tidak memuat satu pun label transaksi', () => {
    for (const config of Object.values(TREND_LABEL)) {
      expect(config.label).not.toMatch(/beli|jual|buy|sell/i);
    }
  });

  it('membedakan DATA_ONLY dari STABLE', () => {
    // Keduanya sering tertukar. DATA_ONLY = "ambangnya belum divalidasi, ini
    // cuma angkanya"; STABLE = "sudah dinilai, dan hasilnya di dalam ambang".
    expect(TREND_LABEL.DATA_ONLY.label).not.toBe(TREND_LABEL.STABLE.label);
    expect(TREND_LABEL.INSUFFICIENT_DATA.label).toMatch(/belum cukup/i);
  });

  it('punya label untuk seluruh status kesegaran', () => {
    expect(FRESHNESS_LABEL.FRESH.label).toBeTruthy();
    expect(FRESHNESS_LABEL.STALE.label).toBeTruthy();
    expect(FRESHNESS_LABEL.MISSING.label).toBeTruthy();
    // STALE tidak boleh berwarna "sukses" - operator harus melihatnya sebagai
    // sesuatu yang perlu perhatian.
    expect(FRESHNESS_LABEL.STALE.variant).not.toBe('success');
  });
});
