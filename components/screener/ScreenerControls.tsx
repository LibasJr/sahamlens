'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Bookmark, Download, Lock, Sliders, X } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { trackSignupClick } from '@/shared/analytics/product-funnel';
import type { ScreenerTemplate } from './screener-model';

type RiskProfile = 'Konservatif' | 'Moderat' | 'Agresif';

interface ScreenerControlsProps {
  // Daftar sektor, BUKAN seluruh objek `data`. Dulu dropdown membacanya dari
  // data?.availableSectors, sehingga satu request gagal (data=null) ikut mengosongkan
  // pilihan sektor padahal daftarnya tidak berubah - lihat komentar di app/screener/page.tsx.
  availableSectors: string[];
  // false = universe dihitung saat bursa buka, jadi vol_ratio null untuk semua emiten
  // dan komponen momentum TIDAK ikut menentukan peringkat (bobot sisanya dinormalisasi
  // ulang). Teks bobot di bawah harus mengatakan itu, bukan menjanjikan "momentum 30%"
  // tanpa syarat.
  momentumScored: boolean;
  riskProfile: RiskProfile;
  setRiskProfile: (value: RiskProfile) => void;
  sectorFilter: string;
  setSectorFilter: (value: string) => void;
  maxPriceInput: string;
  setMaxPriceInput: (value: string) => void;
  minMarketCapInput: string;
  setMinMarketCapInput: (value: string) => void;
  minLiquidityInput: string;
  setMinLiquidityInput: (value: string) => void;
  isConfirmedGuest: boolean;
  sortedRowCount: number;
  exportCsv: () => void;
  templates: ScreenerTemplate[];
  templateNameDraft: string;
  setTemplateNameDraft: (value: string) => void;
  showSaveTemplate: boolean;
  setShowSaveTemplate: (value: boolean | ((current: boolean) => boolean)) => void;
  saveCurrentAsTemplate: () => void;
  applyTemplate: (template: ScreenerTemplate) => void;
  deleteTemplate: (name: string) => void;
}

export default function ScreenerControls({
  availableSectors,
  momentumScored,
  riskProfile,
  setRiskProfile,
  sectorFilter,
  setSectorFilter,
  maxPriceInput,
  setMaxPriceInput,
  minMarketCapInput,
  setMinMarketCapInput,
  minLiquidityInput,
  setMinLiquidityInput,
  isConfirmedGuest,
  sortedRowCount,
  exportCsv,
  templates,
  templateNameDraft,
  setTemplateNameDraft,
  showSaveTemplate,
  setShowSaveTemplate,
  saveCurrentAsTemplate,
  applyTemplate,
  deleteTemplate,
}: ScreenerControlsProps) {
  const resetFilters = () => {
    setSectorFilter('');
    setMaxPriceInput('');
    setMinMarketCapInput('');
    setMinLiquidityInput('');
  };

  return (
    <>
      <Card padding="none" radius="xl" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-tv-gold/10 border border-tv-gold/30 text-tv-gold">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h1 className="lens-page-title">Seleksi Profil Risiko Investor</h1>
            <p className="text-xs text-tv-muted">Pilih toleransi risiko untuk memfilter 10 Saham IDX terbaik berdasarkan penilaian kuantitatif LensScore.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-tv-bg p-1.5 rounded-lg border border-tv-border">
          {(['Konservatif', 'Moderat', 'Agresif'] as const).map((profile) => (
            <motion.button
              key={profile}
              onClick={() => setRiskProfile(profile)}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-colors ${riskProfile === profile ? 'bg-tv-gold text-black shadow-md' : 'text-tv-text hover:bg-tv-hover hover:text-white'}`}
            >
              {profile}
            </motion.button>
          ))}
        </div>
      </Card>

      <p className="-mt-3 text-[11px] leading-relaxed text-tv-muted">
        {riskProfile === 'Konservatif' && 'Konservatif: DER 35%, dividen 30%, ROE 20%, PER 15%. Pertumbuhan dan momentum tidak dihitung sama sekali - saham bertumbuh cepat tapi berutang besar akan tenggelam di profil ini.'}
        {riskProfile === 'Moderat' && 'Moderat: ROE 25%, PER 25%, pertumbuhan 20%, DER 15%, dividen 15%. Momentum tidak dihitung - peringkat di sini murni soal kualitas dan harga, bukan pergerakan harga terkini.'}
        {riskProfile === 'Agresif' && (momentumScored
          ? 'Agresif: pertumbuhan 35%, momentum 30%, ROE 20%, PER 15%. Utang dan dividen berbobot NOL - emiten berutang besar tidak dihukum sedikit pun di profil ini.'
          : 'Agresif: pertumbuhan 35%, ROE 20%, PER 15% - momentum (bobot 30%) TIDAK dihitung untuk peringkat ini karena volume sesi hari ini masih berjalan, jadi bobot ketiga komponen sisanya dinormalisasi ulang. Utang dan dividen tetap berbobot NOL. Peringkat momentum penuh tersedia setelah bursa tutup.')}
      </p>

      <Card padding="none" radius="xl" elevation="sm" overflow="visible" highlight={false} className="border-tv-border p-4 space-y-3">
        <div>
          <span className="lens-meta font-semibold uppercase tracking-wide text-tv-muted block mb-2">Preset Parameter (1-Klik):</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="bare" size="none" type="button" onClick={() => { setRiskProfile('Konservatif'); setMinMarketCapInput('10'); setMinLiquidityInput('10'); setMaxPriceInput(''); setSectorFilter(''); }} className="px-3 py-1.5 rounded-lg border border-tv-green/30 bg-tv-green/[0.08] hover:bg-tv-green/[0.15] text-xs font-semibold text-tv-green flex items-center gap-1.5 transition-colors">🛡️ Quality + Large/Liquid</Button>
            <Button variant="bare" size="none" type="button" onClick={() => { setRiskProfile('Moderat'); setMinMarketCapInput('2'); setMinLiquidityInput('5'); setMaxPriceInput(''); setSectorFilter(''); }} className="px-3 py-1.5 rounded-lg border border-tv-blue/30 bg-tv-blue/[0.08] hover:bg-tv-blue/[0.15] text-xs font-semibold text-tv-blue flex items-center gap-1.5 transition-colors">📈 Kualitas + Valuasi + Growth</Button>
            <Button variant="bare" size="none" type="button" onClick={() => { setRiskProfile('Konservatif'); setMinMarketCapInput('5'); setMinLiquidityInput('5'); setMaxPriceInput(''); setSectorFilter(''); }} className="px-3 py-1.5 rounded-lg border border-tv-gold/30 bg-tv-gold/[0.08] hover:bg-tv-gold/[0.15] text-xs font-semibold text-tv-gold flex items-center gap-1.5 transition-colors">💰 Defensif: Dividen + DER</Button>
            <Button variant="bare" size="none" type="button" onClick={() => { setRiskProfile('Agresif'); setMaxPriceInput('5000'); setMinMarketCapInput('1'); setMinLiquidityInput('2'); setSectorFilter(''); }} className="px-3 py-1.5 rounded-lg border border-tv-purple/30 bg-tv-purple/[0.08] hover:bg-tv-purple/[0.15] text-xs font-semibold text-tv-purple flex items-center gap-1.5 transition-colors">⚡ Growth + Momentum &lt; Rp5.000</Button>
          </div>
          <p className="lens-meta leading-relaxed text-tv-muted">Preset hanya mengisi parameter SahamLens yang terlihat; bukan strategi resmi investor tertentu, bukan indeks resmi, dan bukan jaminan hasil.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-tv-border">
          <div>
            <label htmlFor="screener-sector" className="mb-1 block lens-meta font-semibold uppercase tracking-wide text-tv-muted">Sektor</label>
            <select id="screener-sector" value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} className="h-9 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text focus:border-tv-blue focus:outline-none">
              <option value="">Semua Sektor</option>
              {availableSectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="screener-max-price" className="mb-1 block lens-meta font-semibold uppercase tracking-wide text-tv-muted">Harga Maks (Rp)</label>
            <input id="screener-max-price" type="number" min={1} inputMode="numeric" placeholder="mis. 5000" value={maxPriceInput} onChange={(e) => setMaxPriceInput(e.target.value)} className="h-9 w-32 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text placeholder:text-tv-muted/60 focus:border-tv-blue focus:outline-none" />
          </div>
          <div>
            <label htmlFor="screener-min-mcap" className="mb-1 block lens-meta font-semibold uppercase tracking-wide text-tv-muted">Market Cap Min (Rp T)</label>
            <input id="screener-min-mcap" type="number" min={0} step="any" inputMode="decimal" placeholder="mis. 10" value={minMarketCapInput} onChange={(e) => setMinMarketCapInput(e.target.value)} className="h-9 w-28 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text placeholder:text-tv-muted/60 focus:border-tv-blue focus:outline-none" />
          </div>
          <div>
            <label htmlFor="screener-min-liquidity" className="mb-1 block lens-meta font-semibold uppercase tracking-wide text-tv-muted">Likuiditas Min (Rp M/hari)</label>
            <input id="screener-min-liquidity" type="number" min={0} step="any" inputMode="decimal" placeholder="mis. 1" value={minLiquidityInput} onChange={(e) => setMinLiquidityInput(e.target.value)} className="h-9 w-28 rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text placeholder:text-tv-muted/60 focus:border-tv-blue focus:outline-none" />
          </div>
          {(sectorFilter || maxPriceInput || minMarketCapInput || minLiquidityInput) && (
            <Button variant="bare" size="none" type="button" onClick={resetFilters} className="h-9 rounded-lg border border-tv-border px-3 text-xs font-semibold text-tv-muted transition-colors hover:text-tv-text">Reset filter</Button>
          )}

          <div className="ml-auto flex flex-wrap items-end gap-2">
            {isConfirmedGuest ? (
              <Link onClick={() => trackSignupClick('screener_results')} href="/login?next=%2Fscreener" className="flex h-9 items-center gap-1.5 rounded-lg border border-tv-blue/40 bg-tv-blue/10 px-3 text-xs font-semibold text-tv-blue transition-colors hover:bg-tv-blue/15"><Lock className="h-3.5 w-3.5" /> Masuk untuk simpan & ekspor</Link>
            ) : (
              <>
                <Button variant="bare" size="none" type="button" onClick={() => setShowSaveTemplate((value) => !value)} title="Simpan kombinasi profil + filter saat ini sebagai template" className="flex h-9 items-center gap-1.5 rounded-lg border border-tv-border px-3 text-xs font-semibold text-tv-muted transition-colors hover:text-tv-text"><Bookmark className="h-3.5 w-3.5" /> Simpan Template</Button>
                <Button variant="bare" size="none" type="button" onClick={exportCsv} disabled={sortedRowCount === 0} title="Unduh hasil yang sedang tampil sebagai CSV" className="flex h-9 items-center gap-1.5 rounded-lg border border-tv-blue/30 bg-tv-blue/10 px-3 text-xs font-semibold text-tv-blue transition-colors hover:bg-tv-blue/15 disabled:cursor-not-allowed disabled:opacity-40"><Download className="h-3.5 w-3.5" /> Export CSV</Button>
              </>
            )}
          </div>
        </div>

        {showSaveTemplate && (
          <div className="flex flex-wrap items-center gap-2 border-t border-tv-border pt-3">
            <input type="text" autoFocus placeholder="Nama template, mis. LQ45 Murah" value={templateNameDraft} onChange={(e) => setTemplateNameDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveCurrentAsTemplate()} className="h-9 flex-1 min-w-[180px] rounded-lg border border-tv-border bg-tv-bg px-2.5 text-xs text-tv-text placeholder:text-tv-muted/60 focus:border-tv-blue focus:outline-none" />
            <Button variant="bare" size="none" type="button" onClick={saveCurrentAsTemplate} disabled={!templateNameDraft.trim()} className="h-9 rounded-lg bg-tv-blue px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Simpan</Button>
          </div>
        )}

        {templates.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-tv-border pt-3">
            <span className="lens-meta uppercase tracking-wide text-tv-muted shrink-0 mr-1">Template</span>
            {templates.map((template) => (
              <span key={template.name} className="flex items-center gap-1 rounded-full border border-tv-border bg-tv-bg px-2.5 py-1 text-[11px] text-tv-text">
                <Button variant="bare" size="none" type="button" onClick={() => applyTemplate(template)} className="hover:text-tv-blue transition-colors">{template.name}</Button>
                <Button variant="bare" size="none" type="button" onClick={() => deleteTemplate(template.name)} aria-label={`Hapus template ${template.name}`} className="text-tv-muted hover:text-tv-red transition-colors"><X className="h-3 w-3" /></Button>
              </span>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
