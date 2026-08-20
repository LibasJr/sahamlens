import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InsightRow } from '../InsightRow';
import { MetricBand } from '../MetricBand';
import { SectionHeader } from '../SectionHeader';
import { StatusMeta } from '../StatusMeta';

/**
 * Menghasilkan markup workbench untuk dipotret Playwright.
 *
 * KENAPA DI VITEST DAN BUKAN DI DALAM SPEC PLAYWRIGHT. Playwright memasang transform
 * JSX-nya sendiri untuk component testing, dan transform itu berlaku juga pada komponen
 * yang DIIMPOR spec - jadi JSX di dalam SectionHeader.tsx pun menghasilkan objek
 * `{__pw_type, ...}`, bukan elemen React, dan renderToStaticMarkup menolaknya dengan
 * "Objects are not valid as a React child". Memanggil React.createElement langsung tidak
 * menolong, karena yang bermasalah adalah komponennya, bukan pemanggilnya.
 *
 * Jadi markupnya dirender di sini - di runner yang JSX-nya normal - lalu ditulis ke
 * berkas yang tinggal dimuat Playwright. Komponennya tetap yang SUNGGUHAN; yang berpindah
 * hanya tempat rendernya.
 */
const FIXTURE = path.resolve(__dirname, '../../../e2e/__fixtures__/workbench.html');

function markupWorkbench(): string {
  return renderToStaticMarkup(
    <div className="p-4 md:p-6 lg:p-7 space-y-12">
      <SectionHeader
        eyebrow="Redesign V3"
        title="Visual workbench"
        lede="Setiap primitif dengan data contoh. Dipotret di 375, 768, dan 1440."
      />

      <MetricBand
        items={[
          { label: 'IHSG', value: '8.123,45', detail: '+0,62%', tone: 'positive' },
          { label: 'Breadth', value: '62%', detail: 'Healthy' },
          { label: 'Regime', value: 'Constructive' },
          { label: 'LensRadar', value: '8 kandidat' },
        ]}
      />

      <MetricBand
        items={[
          { label: 'Tanpa data', value: null },
          { label: 'Butuh Pro', value: null, emptyHint: 'butuh akun Pro' },
          { label: 'Turun', value: '4.820', detail: '-0,42%', tone: 'negative' },
          { label: 'Perhatian', value: '3 hari', detail: 'tertunda', tone: 'caution' },
        ]}
      />

      <div>
        <InsightRow direction="BULLISH" title="Momentum membaik" detail="Harga bertahan di atas MA20 dan volume menguat." source="Analyzer MA Trend" />
        <InsightRow direction="BULLISH" title="Akumulasi asing" detail="Net foreign buy dalam empat sesi terakhir." source="LensFlow" />
        <InsightRow direction="BEARISH" title="Tekanan jual meningkat" detail="Distribusi terlihat pada volume harga tinggi." source="Analyzer Volume" />
        <InsightRow direction="NEUTRAL" title="Valuasi relatif tinggi" detail="Masih di atas median historis lima tahun." source="Analyzer PER" />
      </div>

      <StatusMeta items={[{ label: 'Diperbarui 16:15 WIB' }, { label: 'Coverage 92%' }, { label: 'Sumber resmi BEI' }]} />
      <StatusMeta items={[{ label: 'Data mungkin tertunda', tone: 'caution' }, { label: 'Coverage 71%' }]} />
    </div>,
  );
}

describe('fixture workbench', () => {
  it('merender seluruh primitif dan menuliskannya untuk dipotret', () => {
    const markup = markupWorkbench();

    // Penjaga jumlah: kalau rendernya nyaris kosong, potretnya akan "lulus" sambil
    // memotret halaman kosong.
    expect(markup.length).toBeGreaterThan(1500);
    for (const jejak of ['lens-section-title', 'lens-metric', 'lens-meta', 'belum ada data', 'butuh akun Pro']) {
      expect(markup, `${jejak} tidak ada di markup workbench`).toContain(jejak);
    }

    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, markup, 'utf8');
  });
});
