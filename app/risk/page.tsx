'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Activity, PieChart, Plus, Trash2, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import { TickerAnalysisShell } from '@/components/TickerAnalysisShell';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Input, Button, Skeleton } from '@/components/ui';
import { Card } from '@/components/ui/Card';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import Link from 'next/link';
import { Lock } from 'lucide-react';

// AUDIT DATA INTEGRITY 2026-08-03 (temuan M-09): 4 kartu stress test di halaman ini
// SEBELUMNYA angka TETAP ("-5.75%", "-12.5%", "-4.2%", "-6.8%") - halaman sudah jujur
// mengakui ini lewat disclaimer ("belum dihitung dari portofolio Anda"), tapi angkanya
// sendiri tetap karangan, tidak pernah berubah walau alokasi diedit. Sekarang memanggil
// /api/risk-analysis yang menghitung BETA HISTORIS riil (regresi return harian 1 tahun,
// data Yahoo Finance) tiap saham terhadap IHSG dan kurs USD/IDR, dibobot alokasi
// portofolio pengguna. BI Rate TETAP tidak ditampilkan sebagai angka - aplikasi ini
// tidak punya data historis BI Rate, jadi endpoint mengembalikan status "tidak
// tersedia" dan itu yang ditampilkan, bukan angka tebakan.
interface RiskAnalysisResult {
  portfolioBetaIhsg: number | null;
  portfolioBetaUsdIdr: number | null;
  scenarios: {
    ihsgDrop5Pct: number | null;
    ihsgDrop10Pct: number | null;
    usdIdrWeaken1Pct: number | null;
  };
  biRateAvailable: boolean;
}

export default function RiskPage() {
  const [ticker, setTicker] = useState('BBCA');
  // Tidak ada akses ke portofolio transaksi pengguna di halaman ini. Jangan gunakan
  // contoh hardcoded lalu menyebutnya portofolio user; pengguna mengisi simulasi sendiri.
  const [portfolio, setPortfolio] = useState<{ ticker: string; weight: number }[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [newWeight, setNewWeight] = useState(10);
  const [analysis, setAnalysis] = useState<RiskAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { loading: authLoading, resolved: authResolved, user: authUser } = useAuthUser();
  // GEMBOK TAMU (2026-08-23). Beta vs IHSG TETAP terbuka beserta terjemahannya - itu
  // yang membuktikan halaman ini berguna, dan tanpanya tidak ada yang cukup paham
  // untuk mau mendaftar. Yang dikunci: tiga skenario stres dan beta USD/IDR.
  const lockForGuest = !authResolved || authLoading || !authUser;
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  /**
   * Impor komposisi dari portofolio NYATA pengguna (2026-08-23).
   *
   * Sebelumnya halaman ini menyuruh mengetik ulang tiap posisi padahal pengguna sudah
   * mengisinya di /portfolio - keluhan "bingung cara pakainya" berawal dari situ.
   * Catatan lama di berkas ini menyatakan halaman tidak punya akses ke portofolio user;
   * itu tidak lagi benar, /api/portfolio menyediakannya.
   *
   * Bobot diturunkan dari NILAI PEROLEHAN (totalCost), bukan nilai pasar, karena itulah
   * yang tersedia di respons - dan itu DINYATAKAN ke pengguna alih-alih disamarkan
   * seolah bobot pasar terkini.
   */
  const importFromPortfolio = useCallback(async () => {
    setImporting(true);
    setImportNote(null);
    setError(null);
    try {
      const res = await apiRequest<{ holdings?: { symbol: string; totalCost: number }[] }>('/api/portfolio');
      const holdings = (res?.holdings ?? []).filter((h) => h?.symbol && Number(h.totalCost) > 0);
      if (holdings.length === 0) {
        setImportNote('Portofolio Anda belum berisi posisi saham. Tambahkan dulu di menu Portfolio, atau isi manual di bawah.');
        return;
      }
      const total = holdings.reduce((sum, h) => sum + Number(h.totalCost), 0);
      setPortfolio(holdings.map((h) => ({
        ticker: h.symbol.replace(/\.JK$/, '').toUpperCase(),
        weight: Math.round((Number(h.totalCost) / total) * 1000) / 10,
      })));
      setImportNote(`${holdings.length} posisi diimpor. Bobot dihitung dari nilai perolehan, bukan nilai pasar terkini.`);
    } catch (err) {
      setImportNote(isApiClientError(err) ? 'Perlu masuk dulu untuk mengimpor portofolio Anda.' : 'Gagal mengimpor portofolio.');
    } finally {
      setImporting(false);
    }
  }, []);

  const runAnalysis = useCallback(async () => {
    if (portfolio.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const json = await apiRequest<RiskAnalysisResult>('/api/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio }),
      });
      setAnalysis(json);
    } catch (e) {
      setError(isApiClientError(e) ? e.message : 'Gagal menghubungi server analisis risiko');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [portfolio]);

  useEffect(() => {
    // Analisis hanya dimulai setelah pengguna mengisi komposisi simulasi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPosition = () => {
    // SymbolAutocomplete mengembalikan BBCA.JK, sedangkan Risk Matrix menyimpan
    // kode IDX ringkas (BBCA). Normalisasi di satu titik juga mencegah BBCA dan
    // BBCA.JK masuk sebagai dua posisi yang sebetulnya sama.
    const tickerToAdd = newTicker.trim().toUpperCase().replace(/\.JK$/, '');
    if (tickerToAdd && !portfolio.some((item) => item.ticker === tickerToAdd)) {
      setPortfolio([...portfolio, { ticker: tickerToAdd, weight: Number(newWeight) }]);
      setNewTicker('');
    }
  };

  const removePosition = (idx: number) => {
    setPortfolio(portfolio.filter((_, i) => i !== idx));
  };

  const fmtPct = (v: number | null) => (v == null ? 'N/A' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);

  return (
    <TickerAnalysisShell
      ticker={ticker}
      onTickerChange={setTicker}
      moduleTitle="Risk Matrix & Stress Testing"
      icon={<ShieldAlert className="w-6 h-6" />}
      accent="red"
      title="Risk Matrix & Stress Testing Portofolio"
      subtitle="Beta historis 1 tahun (regresi return harian terhadap IHSG & USD/IDR, data Yahoo Finance) - dihitung dari komposisi portofolio Anda"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6">
        <Card padding="none" radius="lg" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <PieChart className="w-5 h-5 text-tv-red" />
            Komposisi Simulasi (%)
          </h3>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {portfolio.length === 0 ? (
              <div className="rounded-md border border-dashed border-tv-border px-3 py-4 text-xs leading-relaxed text-tv-muted">
                <p className="font-bold text-tv-text">Halaman ini menghitung seberapa keras portofolio Anda terguncang saat pasar jatuh.</p>
                <p className="mt-1.5">
                  Isi komposisinya dulu - impor dari portofolio Anda, atau ketik ticker dan bobot di bawah.
                  Hasilnya: beta terhadap IHSG dan USD/IDR, plus simulasi saat IHSG turun 5% dan 10%.
                </p>
              </div>
            ) : portfolio.map((item, idx) => (
              <div key={item.ticker} className="flex items-center justify-between p-2.5 rounded-md bg-tv-bg border border-tv-border text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-tv-text px-2 py-0.5 rounded bg-tv-hover border border-tv-borderLight">
                    {item.ticker}
                  </span>
                  <span className="text-tv-text font-bold font-number">{item.weight}%</span>
                </div>
                <Button variant="bare" size="none"
                  aria-label={`Hapus ${item.ticker} dari daftar posisi`}
                  onClick={() => removePosition(idx)}
                  className="p-1 text-tv-muted hover:text-tv-red transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* BUG FIX (2026-08-22): backend menormalisasi ulang bobot saham yang beta-nya
              GAGAL dihitung dari sisa saham yang berhasil (lihat app/api/risk-analysis/
              route.ts) - tapi UI ini tidak pernah menampilkan total bobot atau menyebut
              normalisasi itu, jadi user yang menambah mis. 3 posisi @10% tidak tahu
              apakah sisa 70% dianggap "kas" atau ada penjelasan lain. */}
          {portfolio.length > 0 && (() => {
            const totalWeight = portfolio.reduce((sum, item) => sum + item.weight, 0);
            const isBalanced = Math.abs(totalWeight - 100) < 0.5;
            return (
              <div className="flex items-center justify-between rounded-md bg-tv-bg/60 border border-tv-border px-2.5 py-1.5 text-[11px]">
                <span className="text-tv-muted">Total bobot diisi</span>
                <span className={`font-bold font-number ${isBalanced ? 'text-tv-text' : 'text-tv-yellow'}`}>{totalWeight}%</span>
              </div>
            );
          })()}
          <p className="text-[10px] leading-relaxed text-tv-muted">
            Bobot tidak wajib berjumlah 100% - kalkulator memakainya sebagai proporsi relatif antar-posisi.
            Kalau beta salah satu saham gagal dihitung (data tidak tersedia), saham itu dikeluarkan dan bobot sisanya
            dinormalisasi ulang di antara saham yang berhasil, bukan diperlakukan sebagai kas.
          </p>

          <div className="pt-2 border-t border-tv-border">
            <Button
              variant="bare"
              size="none"
              onClick={() => void importFromPortfolio()}
              disabled={importing}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-md border border-tv-border bg-tv-bg px-3 py-2 text-xs font-bold text-tv-text transition hover:border-tv-blue hover:text-tv-blue disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              {importing ? 'Mengimpor...' : 'Impor dari Portofolio saya'}
            </Button>
            {importNote && (
              <p className="mb-2 rounded-md border border-tv-border bg-tv-bg/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-tv-muted">
                {importNote}
              </p>
            )}
          </div>

          <div className="flex items-end gap-2">
            <SymbolAutocomplete
              containerClassName="relative flex-1"
              value={newTicker}
              onChange={setNewTicker}
              placeholder="Ticker (cth: BMRI)"
              className="h-11 w-full rounded-xl border border-white/[0.08] bg-black/15 px-3 text-base text-tv-text shadow-inner placeholder:text-tv-muted/60 transition-all duration-150 focus:border-tv-blue/65 focus:bg-black/20 focus:outline-none focus:ring-2 focus:ring-tv-blue/10 sm:h-9 sm:text-xs"
              aria-label="Cari ticker untuk portofolio simulasi"
            />
            <Input
              size="sm"
              type="number"
              value={newWeight}
              onChange={(e) => setNewWeight(Number(e.target.value))}
              placeholder="%"
              className="w-16 font-number"
            />
            <Button size="sm" variant="success" onClick={addPosition}>
              <Plus className="w-4 h-4" /> Tambah
            </Button>
          </div>

          <Button size="sm" variant="secondary" onClick={runAnalysis} disabled={loading} className="w-full">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Menghitung...' : 'Hitung Ulang Beta Portofolio'}
          </Button>
        </Card>

        {/* Stress Testing Results */}
        <Card padding="none" radius="lg" elevation="none" highlight={false} overflow="visible" className="lg:col-span-2 border-tv-border p-5 shadow-1 space-y-4">
          <h3 className="font-heading text-base font-bold text-tv-text flex items-center gap-2 border-b border-tv-border pb-3">
            <Activity className="w-5 h-5 text-tv-yellow" />
            Hasil Stress Test (Beta Historis Portofolio)
          </h3>

          {error && (
            <div className="p-3 rounded-md bg-tv-red/10 border border-tv-red/30 text-xs text-tv-red">{error}</div>
          )}

          {/* BUG FIX (2026-08-22): sebelumnya tidak ada skeleton di sini sama sekali -
              hanya tombol yang menunjukkan spinner ("Menghitung..."), sementara kartu
              metrik ini tetap menampilkan nilai LAMA (atau N/A) tanpa indikasi visual
              bahwa sedang dihitung ulang. */}
          {lockForGuest ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-tv-border py-8 text-center">
              <Lock className="h-5 w-5 text-tv-yellow" />
              <p className="text-sm font-bold text-tv-text">Simulasi guncangan terkunci</p>
              <p className="max-w-sm px-4 text-xs leading-relaxed text-tv-muted">
                Buat akun gratis untuk melihat berapa persen portofolio ini turun saat IHSG jatuh 5%
                dan 10%, serta dampak pelemahan Rupiah.
              </p>
              <Link
                href="/login?next=/risk"
                className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-tv-blueHover"
              >
                Masuk atau daftar gratis
              </Link>
            </div>
          ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">IHSG Drops -5%</div>
              {loading ? <Skeleton className="h-6 w-16 mt-0.5" /> : <div className="text-lg font-bold text-tv-red font-number">{fmtPct(analysis?.scenarios.ihsgDrop5Pct ?? null)}</div>}
              <div className="text-[10px] text-tv-muted mt-1">Beta portofolio x -5%</div>
            </div>
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">IHSG Crash -10%</div>
              {loading ? <Skeleton className="h-6 w-16 mt-0.5" /> : <div className="text-lg font-bold text-tv-red font-number">{fmtPct(analysis?.scenarios.ihsgDrop10Pct ?? null)}</div>}
              <div className="text-[10px] text-tv-muted mt-1">Beta portofolio x -10%</div>
            </div>
            <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted font-semibold tracking-wide">USD/IDR Melemah 1%</div>
              {loading ? <Skeleton className="h-6 w-16 mt-0.5" /> : <div className="text-lg font-bold text-tv-yellow font-number">{fmtPct(analysis?.scenarios.usdIdrWeaken1Pct ?? null)}</div>}
              <div className="text-[10px] text-tv-muted mt-1">Beta portofolio vs USDIDR=X</div>
            </div>
          </div>
          )}

          <div className="p-3.5 rounded-md bg-tv-bg border border-tv-border text-xs text-tv-muted">
            <span className="font-bold text-tv-text">BI Rate Hike:</span> Data tidak tersedia - SahamLens belum
            memiliki sumber data historis BI Rate untuk menghitung sensitivitas riil (lihat{' '}
            <code className="text-tv-text">modules/macro/</code>, hanya kurs USD/IDR yang tersinkronkan). Angka
            sensitivitas BI Rate tidak ditampilkan supaya tidak mengarang.
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted uppercase">Beta Portofolio vs IHSG</div>
              {loading ? <Skeleton className="h-5 w-12 mt-1" /> : <div className="text-tv-text font-bold font-number mt-1">{analysis?.portfolioBetaIhsg ?? 'N/A'}</div>}
              {/* Angka beta tidak berarti apa-apa bagi yang belum tahu beta - dan itulah
                  mayoritas pengguna. Diterjemahkan ke kalimat yang bisa langsung dipakai,
                  memakai angka portofolionya sendiri, bukan contoh umum. */}
              {!loading && typeof analysis?.portfolioBetaIhsg === 'number' && (
                <p className="mt-1 text-[10px] leading-relaxed text-tv-muted">
                  Artinya: kalau IHSG turun 10%, portofolio ini secara historis bergerak
                  sekitar <span className="font-bold text-tv-text">{(analysis.portfolioBetaIhsg * 10).toFixed(1)}%</span>.
                  {analysis.portfolioBetaIhsg > 1
                    ? ' Lebih liar daripada pasar.'
                    : analysis.portfolioBetaIhsg < 1
                    ? ' Lebih kalem daripada pasar.'
                    : ' Bergerak seirama pasar.'}
                </p>
              )}
            </div>
            <div className="p-3 rounded-md bg-tv-bg border border-tv-border">
              <div className="text-[10px] text-tv-muted uppercase">Beta Portofolio vs USD/IDR</div>
              {lockForGuest ? (
                <Link
                  href="/login?next=/risk"
                  aria-label="Masuk untuk melihat beta portofolio terhadap USD/IDR"
                  className="mt-1 inline-flex items-center gap-1.5 font-bold text-tv-blue hover:underline"
                >
                  <Lock className="h-4 w-4" />
                </Link>
              ) : loading ? <Skeleton className="h-5 w-12 mt-1" /> : <div className="text-tv-text font-bold font-number mt-1">{analysis?.portfolioBetaUsdIdr ?? 'N/A'}</div>}
              {!lockForGuest && !loading && typeof analysis?.portfolioBetaUsdIdr === 'number' && (
                <p className="mt-1 text-[10px] leading-relaxed text-tv-muted">
                  {analysis.portfolioBetaUsdIdr < 0
                    ? 'Bernilai negatif: portofolio ini cenderung melemah saat Rupiah melemah.'
                    : 'Bernilai positif: portofolio ini cenderung menguat saat Rupiah melemah.'}
                </p>
              )}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-tv-bg border border-tv-border space-y-2 text-xs">
            <div className="text-tv-yellow font-bold uppercase flex items-center gap-1.5 tracking-wide">
              <AlertTriangle className="w-4 h-4 text-tv-yellow" />
              Metodologi
            </div>
            <p className="text-tv-muted leading-relaxed">
              Beta dihitung dari regresi return harian 1 tahun tiap saham terhadap IHSG/USD=X (data historis Yahoo
              Finance), dibobot alokasi portofolio Anda. Ini estimasi statistik dari histori masa lalu, bukan
              jaminan pergerakan yang akan terjadi.
            </p>
          </div>
        </Card>
      </div>
    </TickerAnalysisShell>
  );
}
