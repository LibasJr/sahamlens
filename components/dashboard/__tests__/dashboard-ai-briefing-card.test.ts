import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');

function baca(file: string): string {
  const full = path.join(ROOT, file);
  expect(fs.existsSync(full), `${file} hilang`).toBe(true);
  return fs.readFileSync(full, 'utf8');
}

describe('DashboardAiBriefingCard (AI Market Pulse & Intrinsic Explainer UI)', () => {
  it('memiliki berkas komponen DashboardAiBriefingCard yang memanggil /api/ai-briefing', () => {
    const src = baca('components/dashboard/DashboardAiBriefingCard.tsx');
    expect(src).toContain('export function DashboardAiBriefingCard');
    expect(src).toContain('/api/ai-briefing');
    expect(src).toContain('AI Market Pulse Briefing');
    expect(src).toContain('LensAI');
    expect(src).toContain('apiRequest');
  });

  it('menggunakan komponen primitif Card dan Button tanpa tag html mentah terlarang', () => {
    const src = baca('components/dashboard/DashboardAiBriefingCard.tsx');
    expect(src).toContain("import { Card } from '@/components/ui/Card'");
    expect(src).toContain("import { Button } from '@/components/ui/Button'");
    expect(src).not.toMatch(/<button[\s>]/);
  });

  it('terintegrasi di DashboardIndexSection untuk tampilan pasar IHSG', () => {
    const indexSec = baca('components/dashboard/DashboardIndexSection.tsx');
    expect(indexSec).toContain("import { DashboardAiBriefingCard } from '@/components/dashboard/DashboardAiBriefingCard'");
    expect(indexSec).toContain('<DashboardAiBriefingCard changePct={stock.change_pct} />');
  });

  it('DashboardFooterActions memiliki tautan navigasi ke Intrinsic AI Explainer', () => {
    const footer = baca('components/dashboard/DashboardFooterActions.tsx');
    expect(footer).toContain('#intrinsic');
    expect(footer).toContain('Intrinsic AI Explainer');
  });
});
