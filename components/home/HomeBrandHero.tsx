'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search, ShieldCheck } from 'lucide-react';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Button } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';

/**
 * Hero TIDAK menerima data pasar lagi.
 *
 * KENAPA. Sebelum ini IHSG tampil TIGA KALI dalam satu layar pertama: di TopMarketBar
 * yang menempel terus, di kartu kanan hero, dan sekali lagi di MetricBand snapshot tepat
 * di bawahnya. PRD SEC.12 meminta hero compact dan product-first; PRD SEC.13 sudah
 * menugaskan angka pasar kepada band. Yang dicabut di sini cuma salinan ketiganya -
 * angkanya sendiri tidak hilang dari layar, dan tidak ada request yang berkurang atau
 * bertambah karena hero memang tidak pernah meminta datanya sendiri.
 */

const POPULAR_SYMBOLS = ['BBCA', 'BBRI', 'BMRI', 'TLKM'];

export default function HomeBrandHero() {
  const router = useRouter();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');

  const openSymbol = (symbol: string) => {
    const clean = symbol.trim().toUpperCase().replace(/\.JK$/i, '');
    if (clean) router.push(`/technical/${clean}.JK`);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openSymbol(query);
  };

  return (
    // BUKAN <Card>. Card selalu memasang `border` + `rounded-2xl` pada semua sisi, jadi
    // meski dipanggil dengan variant="flat" dan bg-transparent, hero tetap terbaca
    // sebagai kotak mengambang - persis "card soup" yang PRD SEC.5.3 minta dikurangi dan
    // tampilan landing page SaaS yang SEC.12 minta dihindari. Yang dibutuhkan di sini
    // cuma satu garis bawah sebagai pemisah bagian.
    <section className="border-b border-tv-border/70 pb-6 pt-1 sm:pb-7 sm:pt-2 lg:pb-8">
      {/* Satu aliran, bukan dua kolom. PRD SEC.11 meminta beranda terbaca editorial;
          kolom kanan berisi angka pasar membuat layar pertama terbaca sebagai dashboard
          sebelum satu kalimat pun sempat dibaca. */}
      <div className="min-w-0">
        <div>
          <div className="lens-meta inline-flex items-center gap-2 font-bold uppercase tracking-[0.16em] text-tv-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-tv-blue" aria-hidden="true" />
            SahamLens · Beta Research Workspace
          </div>

          <h1 className="lens-hero-title mt-3 max-w-3xl text-tv-text">
            {t('hero.titleLine1')}{' '}
            <span className="text-tv-blue">{t('hero.titleLine2')}</span>
          </h1>

          <p className="lens-body mt-3 max-w-2xl text-tv-muted">
            {t('hero.description')}
          </p>

          <form onSubmit={onSubmit} className="mt-5 flex max-w-2xl items-stretch gap-2">
            <SymbolAutocomplete
              value={query}
              onChange={setQuery}
              onSelect={openSymbol}
              placeholder={t('common.searchPlaceholder')}
              showSearchIcon
              maxSuggestions={5}
              containerClassName="relative min-w-0 flex-1"
              className="h-12 w-full rounded-xl border border-tv-border bg-tv-surface/80 pl-10 pr-3 text-sm font-semibold text-tv-text outline-none transition focus:border-tv-blue/70 focus:ring-2 focus:ring-tv-blue/10"
              aria-label={t('common.searchPlaceholder')}
            />
            <Button type="submit" size="none" className="h-12 shrink-0 rounded-xl px-4 sm:px-5">
              <Search className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.search')}</span>
              <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden="true" />
            </Button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="lens-meta font-semibold text-tv-muted">{t('common.popular')}:</span>
            {POPULAR_SYMBOLS.map((symbol) => (
              <Link
                key={symbol}
                href={`/technical/${symbol}.JK`}
                className="lens-meta font-number font-bold text-tv-muted transition hover:text-tv-blue"
              >
                {symbol}
              </Link>
            ))}
            <span className="hidden h-3 w-px bg-tv-border sm:block" aria-hidden="true" />
            <Link href="/screener" className="lens-meta font-semibold text-tv-blue hover:underline">Screener</Link>
            <Link href="/breakout-radar" className="lens-meta font-semibold text-tv-blue hover:underline">LensRadar</Link>
          </div>
        </div>


        {/* Penyangkalan TETAP di layar pertama - PRD SEC.5.6 "Trust Is Visible".
            Yang berubah cuma bentuknya: dulu kotak ber-border di dalam kolom kanan,
            jadi ia terbaca sebagai objek setara angka pasar. Sekarang satu baris
            tenang di bawah pencarian, tetap terbaca sebelum pengguna menggulir. */}
        <p className="mt-4 flex max-w-2xl items-start gap-2 lens-meta leading-relaxed text-tv-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tv-green" aria-hidden="true" />
          <span><span className="font-semibold text-tv-text">{t('common.disclaimerShort')}</span> {t('hero.disclaimerBox')}</span>
        </p>
      </div>
    </section>
  );
}
