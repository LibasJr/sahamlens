import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');

function baca(file: string): string {
  const full = path.join(ROOT, file);
  expect(fs.existsSync(full), `${file} hilang`).toBe(true);
  return fs.readFileSync(full, 'utf8');
}

describe('StockRiskStressTestCard (Dashboard Stress-Test UI)', () => {
  it('memiliki berkas komponen StockRiskStressTestCard', () => {
    const src = baca('components/dashboard/StockRiskStressTestCard.tsx');
    expect(src).toContain('export function StockRiskStressTestCard');
    expect(src).toContain('/api/risk-analysis');
    expect(src).toContain('Stress-Test & Sensitivitas Pasar');
    expect(src).toContain('Beta terhadap IHSG');
    expect(src).toContain('Beta terhadap USD/IDR');
    expect(src).toContain('ihsgDrop5Pct');
    expect(src).toContain('ihsgDrop10Pct');
    expect(src).toContain('usdIdrWeaken1Pct');
  });

  it('menggunakan komponen primitif Card dan tidak memakai tag html mentah terlarang', () => {
    const src = baca('components/dashboard/StockRiskStressTestCard.tsx');
    expect(src).toContain("import { Card } from '@/components/ui/Card'");
    expect(src).not.toMatch(/<button[\s>]/);
  });

  it('terintegrasi di dashboard utama page.tsx', () => {
    const dashboard = baca('app/dashboard/page.tsx');
    expect(dashboard).toContain("import { StockRiskStressTestCard } from '@/components/dashboard/StockRiskStressTestCard'");
    expect(dashboard).toContain('<StockRiskStressTestCard ticker={ticker} />');
  });

  it('memiliki link menuju halaman risiko portofolio /risk', () => {
    const src = baca('components/dashboard/StockRiskStressTestCard.tsx');
    expect(src).toContain('href="/risk"');
  });
});
