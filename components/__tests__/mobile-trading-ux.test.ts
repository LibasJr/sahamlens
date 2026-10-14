import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculatePositionSize } from '../../lib/utils/position-sizer';

const ROOT = path.resolve(__dirname, '../..');

function baca(file: string): string {
  const full = path.join(ROOT, file);
  expect(fs.existsSync(full), `${file} hilang`).toBe(true);
  return fs.readFileSync(full, 'utf8');
}

describe('Mobile Trading UX Enhancements', () => {
  describe('QuickTickerSwitcher', () => {
    it('memiliki berkas komponen QuickTickerSwitcher', () => {
      const src = baca('components/QuickTickerSwitcher.tsx');
      expect(src).toContain('QuickTickerSwitcher');
      expect(src).toContain('DEFAULT_POPULAR_TICKERS');
      expect(src).toContain('BBCA');
      expect(src).toContain('BBRI');
      expect(src).toContain('BMRI');
      expect(src).toContain('TLKM');
    });

    it('menggunakan Button primitif dan tidak memakai raw button', () => {
      const src = baca('components/QuickTickerSwitcher.tsx');
      expect(src).toContain("import { Button } from '@/components/ui/Button'");
      expect(src).not.toMatch(/<button[\s>]/);
    });

    it('memiliki tombol cepat tambah ke Watchlist', () => {
      const src = baca('components/QuickTickerSwitcher.tsx');
      expect(src).toContain('Watchlist +');
      expect(src).toContain('handleToggleWatchlist');
    });

    it('diintegrasikan ke dalam Header saat stockNav aktif', () => {
      const header = baca('components/Header.tsx');
      expect(header).toContain("import QuickTickerSwitcher from './QuickTickerSwitcher'");
      expect(header).toContain('<QuickTickerSwitcher');
    });
  });

  describe('HitungLotSheet (FAB & Bottom Sheet)', () => {
    it('memiliki berkas komponen HitungLotSheet', () => {
      const src = baca('components/HitungLotSheet.tsx');
      expect(src).toContain('HitungLotSheet');
      expect(src).toContain('useModalBehavior');
      expect(src).toContain('calculatePositionSize');
    });

    it('memiliki FAB floating action button mobile yang tidak menabrak nav clearance', () => {
      const src = baca('components/HitungLotSheet.tsx');
      expect(src).toContain('var(--lens-mobile-nav-clearance');
      expect(src).toContain('Hitung Lot');
      expect(src).toContain('md:hidden');
    });

    it('memiliki focus trap dan aria-modal untuk aksesibilitas', () => {
      const src = baca('components/HitungLotSheet.tsx');
      expect(src).toContain('role="dialog"');
      expect(src).toContain('aria-modal="true"');
      expect(src).toContain('useModalBehavior');
    });

    it('terintegrasi ke dalam StockChartPanel', () => {
      const chartPanel = baca('components/StockChartPanel.tsx');
      expect(chartPanel).toContain("import HitungLotSheet from '@/components/HitungLotSheet'");
      expect(chartPanel).toContain('<HitungLotSheet');
    });

    it('menghitung ukuran posisi IDX secara akurat (100 lembar/lot)', () => {
      const calc = calculatePositionSize({
        capitalIdr: 10_000_000,
        riskTolerancePct: 2.0, // Rp 200.000 max loss
        entryPrice: 3000,
        cutLossPrice: 2850, // Resiko Rp 150/lembar = Rp 15.000/lot
      });

      // 200.000 / 15.000 = 13.33 -> 13 lot
      expect(calc.isValid).toBe(true);
      expect(calc.maxLots).toBe(13);
      expect(calc.totalShares).toBe(1300);
      expect(calc.totalPositionCostIdr).toBe(1300 * 3000); // 3.900.000
      expect(calc.actualRiskLossIdr).toBe(1300 * 150); // 195.000 (<= 200.000)
    });
  });
});
