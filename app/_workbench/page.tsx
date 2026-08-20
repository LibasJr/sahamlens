import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  InsightRow,
  MetricBand,
  PageContainer,
  ResearchTabs,
  SectionHeader,
  StatusMeta,
} from '@/components/ui';

/**
 * Visual workbench Redesign V3.
 *
 * KENAPA ADA. Aplikasi ini tidak bisa dijalankan tanpa Postgres, Redis, dan data pasar
 * hulu, jadi tanpa halaman ini seluruh redesign ditulis sambil menebak hasilnya. Di sini
 * setiap primitif berdiri berdampingan dengan data contoh - dan berdampingan itulah
 * satu-satunya cara ketidakkonsistenan spacing dan tipografi terlihat SEBELUM tersebar ke
 * sepuluh halaman.
 *
 * TIDAK BOLEH BISA DIBUKA PENGGUNA. Tiga lapis, karena satu lapis akan dilupakan:
 * notFound() di produksi, noindex, dan disallow di robots.txt. Sitemap memakai allowlist,
 * jadi ia aman dengan sendirinya.
 */
export const metadata: Metadata = {
  title: 'Workbench V3',
  robots: { index: false, follow: false },
};

const TABS = [
  { id: 'technical', label: 'Technical', href: '#' },
  { id: 'fundamental', label: 'Fundamental', href: '#' },
  { id: 'flow', label: 'Flow', href: '#' },
  { id: 'valuation', label: 'Valuation', href: '#' },
];

export default function WorkbenchPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <PageContainer className="space-y-12 p-4 md:p-6 lg:p-7">
      <SectionHeader
        eyebrow="Redesign V3"
        title="Visual workbench"
        lede="Setiap primitif dengan data contoh. Dipotret di 375, 768, dan 1440."
      />

      <section className="space-y-4">
        <SectionHeader as="h3" title="MetricBand" lede="Deret metrik sebaris. 2 kolom di ponsel." />
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
      </section>

      <section className="space-y-1">
        <SectionHeader as="h3" title="InsightRow" lede="Tiga sampai lima temuan, bukan dinding kartu." />
        <InsightRow direction="BULLISH" title="Momentum membaik" detail="Harga bertahan di atas MA20 dan volume menguat." source="Analyzer MA Trend" />
        <InsightRow direction="BULLISH" title="Akumulasi asing" detail="Net foreign buy dalam empat sesi terakhir." source="LensFlow" />
        <InsightRow direction="BEARISH" title="Tekanan jual meningkat" detail="Distribusi terlihat pada volume harga tinggi." source="Analyzer Volume" />
        <InsightRow direction="NEUTRAL" title="Valuasi relatif tinggi" detail="Masih di atas median historis lima tahun." source="Analyzer PER" />
      </section>

      <section className="space-y-4">
        <SectionHeader as="h3" title="StatusMeta" lede="Baris kepercayaan: umur data, cakupan, sumber." />
        <StatusMeta items={[{ label: 'Diperbarui 16:15 WIB' }, { label: 'Coverage 92%' }, { label: 'Sumber resmi BEI' }]} />
        <StatusMeta items={[{ label: 'Data mungkin tertunda', tone: 'caution', title: 'Bar terakhir 18 Agu 16:15 WIB' }, { label: 'Coverage 71%' }]} />
      </section>

      <section className="space-y-4">
        <SectionHeader as="h3" title="ResearchTabs" lede="Berpindah antar bagian riset. 44px di semua lebar." />
        <ResearchTabs tabs={TABS} activeId="technical" label="Contoh sudut pandang" />
        <ResearchTabs tabs={TABS} activeId={null} label="Contoh tanpa tab aktif" />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Contoh"
          title="SectionHeader dengan aksi"
          lede="Eyebrow, judul, lede, dan satu aksi di kanan."
          action={<span className="lens-label text-tv-blue">Lihat semua</span>}
        />
      </section>
    </PageContainer>
  );
}
