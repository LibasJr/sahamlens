import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ClientHeader from './ClientHeader';
import StockChartPanel from '@/components/StockChartPanel';
import { LogIn, Crown, Lock } from 'lucide-react';
import { WA_NUMBER } from '@/shared/constants/app.constants';
import { getPaymentMethods } from '@/shared/config/payment';
import { MONTHLY_PRICE, formatRupiah } from '@/shared/config/pricing';
import { PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';
import TechnicalExportSection from '@/components/export/TechnicalExportSection';
import MarketDataIntegrityBanner from '@/components/MarketDataIntegrityBanner';
import BrokerDistributionPanel from './BrokerDistributionPanel';
import BandarFlowPro from '@/components/BandarFlowPro';
import TechnicalAnalysisSuite from '@/components/technical/TechnicalAnalysisSuite';
import { getTrustedAppOrigin } from '@/shared/http/server-origin';
import { getEmitenSymbolSet, loadEmitenList } from '@/shared/market/emiten-list';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getSession } from '@/modules/user';
import { cookies } from 'next/headers';
import { getAnalyzerDirectionLabel, getKategoriPresentationLabel, getKategoriTone } from '@/shared/presentation/signal-labels';



const SITE_URL = 'https://sahamlens.id';

// Sementara disembunyikan dari halaman Technical sampai validasi/UX Broker Summary siap.
// Admin import dan data broker_summary_period tetap dipertahankan.
const SHOW_BROKER_DISTRIBUTION_PANEL = false;

function normalizeTechnicalSymbol(rawSymbol: string): string {
  const normalized = normalizeIdxTickerParam(rawSymbol, { allowMarketIndex: true });
  if (!normalized) return '';
  return normalized === '^JKSE' ? '^JKSE' : normalized.replace(/\.JK$/, '');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol: rawSymbol } = await params;
  const code = normalizeTechnicalSymbol(rawSymbol);
  if (code === '^JKSE') {
    return {
      title: 'Analisis Teknikal IHSG | SahamLens',
      description: 'Chart dan indikator teknikal Indeks Harga Saham Gabungan (IHSG).',
      alternates: { canonical: `${SITE_URL}/technical/IHSG` },
    };
  }
  const emiten = loadEmitenList().find((item) => item.symbol === code);

  if (!emiten) {
    return {
      title: 'Emiten tidak ditemukan | SahamLens',
      robots: { index: false, follow: false },
    };
  }

  const displayName = emiten.name === code ? code : emiten.name;
  const title = `Analisis Saham ${code} - Teknikal, Chart & LensScore | SahamLens`;
  const description = `Analisis teknikal saham ${code}${displayName !== code ? ` (${displayName})` : ''}: chart interaktif, indikator, LensScore, momentum, flow, dan konteks risiko berbasis data SahamLens.`;
  const canonical = `${SITE_URL}/technical/${code}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'website',
      siteName: 'SahamLens',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

// Sumber data halaman ini SEKARANG deterministik sepenuhnya.
//
// Sebelumnya halaman ini menampilkan dua narasi LLM berdampingan: Council ("10 agen",
// sebenarnya satu prompt besar yang berperan sebagai sepuluh) dan Orchestrator. Keduanya
// dibuang. Penggantinya `calculateConsensus()` di app/api/stock/[ticker] - vote analyzer
// teknikal yang ditimbang per-dimensi, aritmetika murni yang bisa diaudit baris per baris.
//
// KENAPA DIGANTI, BUKAN SEKADAR DIHAPUS: halaman ini pintu utama pengunjung (lihat
// MobileNav GUEST_PRIMARY_ITEM, berlabel "Konsensus"). Menghapus tanpa mengganti akan
// menyisakan chart tanpa analisis apa pun.
//
// KENAPA LLM-nya DIBUANG: sepuluh "agen" itu menarik dari deret harga & volume yang SAMA
// dengan analyzer deterministik - jadi ia bukan pendapat kedua yang independen, melainkan
// bukti yang sama dihitung dua kali lalu disajikan berdampingan seolah dua saksi. Itulah
// sebab satu emiten bisa tampil "SINYAL BUY" di LensWatch dan "HOLD" di sini pada hari
// yang sama.
//
// `signedIn` dikembalikan terpisah dari `status` karena keduanya menjawab pertanyaan yang
// berbeda. BUG FIX (2026-08-11) yang tetap berlaku: dulu SEMUA kegagalan yang bukan
// 401/402/429 jatuh ke teaser "Masuk dulu", jadi user yang SUDAH login disuruh login lagi
// setiap kali sumber datanya gagal. Status kegagalan teknis tidak boleh diterjemahkan
// menjadi "kamu belum login".
async function getKonsensusData(symbol: string): Promise<{ data: any; status: number; signedIn: boolean }> {
  let signedIn = false;
  try {
    const session = await getSession();
    signedIn = Boolean(session);

    // Cookie diteruskan apa adanya supaya /api/stock menilai sesi & kuota memakai
    // identitas pengguna yang sebenarnya. JANGAN diganti header internal-service:
    // itu melewati gerbang kuota, dan pengunjung akan mendapat data Pro cuma-cuma.
    const jar = await cookies();
    const baseUrl = getTrustedAppOrigin();
    const res = await fetch(`${baseUrl}/api/stock/${encodeURIComponent(symbol)}`, {
      cache: 'no-store',
      headers: { cookie: jar.toString() },
    });
    if (!res.ok) return { data: null, status: res.status, signedIn };
    return { data: await res.json(), status: 200, signedIn };
  } catch (error) {
    console.error('Konsensus teknikal error:', error);
    return { data: null, status: 500, signedIn };
  }
}

/** Ubah keputusan analyzer menjadi label yang dipakai kartu ekspor & batang suara. */
function sinyalDariAnalyzer(decision: string): 'BUY' | 'SELL' | 'HOLD' {
  if (decision === 'BULLISH') return 'BUY';
  if (decision === 'BEARISH') return 'SELL';
  return 'HOLD';
}

// Tiga indikator ini cukup untuk memberi gambaran cara kerja halaman tanpa
// membocorkan seluruh breakdown analyzer kepada pengunjung yang belum masuk.
// Gunakan nama indikator, bukan posisi array, karena urutan dari API dapat berubah.
const GUEST_VISIBLE_ANALYZER_KEYWORDS = ['EMA', 'RSI', 'MA Trend'];

function isGuestVisibleAnalyzer(label: unknown): boolean {
  const normalizedLabel = typeof label === 'string' ? label : '';
  return GUEST_VISIBLE_ANALYZER_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword));
}

async function LensConsensusAnalysisDisplay({ symbol }: { symbol: string }) {
  const { data, status, signedIn } = await getKonsensusData(symbol);

  if (!data) {
    // Chart + indikator dasar tetap tampil publik (lihat StockChartPanel di atas) -
    // hanya konsensus teknikal Pro yang butuh login/upgrade, jadi teaser-nya
    // spesifik per alasan (belum login vs belum Pro) alih-alih pesan error generik.
    // Ajakan login HANYA untuk yang benar-benar belum punya sesi.
    if (!signedIn && status === 401) {
      return (
        <div className="bg-tv-card border border-tv-border rounded-xl p-8 text-center">
          <LogIn className="w-8 h-8 mx-auto mb-3 text-tv-blue" />
          <p className="text-white font-semibold mb-1">Masuk dulu, yuk, untuk lihat analisis lengkap</p>
          <p className="text-tv-muted text-sm mb-4">Grafik dan indikator dasar tetap bisa kamu lihat gratis. Untuk rangkuman LensConsensus yang lebih lengkap, masuk dulu supaya datanya bisa kami tampilkan.</p>
          <Link href={`/login?next=/technical/${symbol}`} className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2.5 text-sm font-bold text-white hover:bg-tv-blueHover transition">
            Masuk sekarang
          </Link>
        </div>
      );
    }
    if (!signedIn && status === 429) {
      return (
        <div className="bg-tv-card border border-tv-border rounded-xl p-8 text-center">
          <LogIn className="w-8 h-8 mx-auto mb-3 text-tv-blue" />
          <p className="text-white font-semibold mb-1">Jatah coba LensConsensus kamu sudah habis</p>
          <p className="text-tv-muted text-sm mb-4">Masuk dulu untuk melanjutkan LensConsensus dan membuka analisis lengkap {symbol}.</p>
          <Link href={`/login?next=/technical/${symbol}`} className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2.5 text-sm font-bold text-white hover:bg-tv-blueHover transition">
            Masuk untuk lanjut
          </Link>
        </div>
      );
    }
    if (status === 402) {
      const paymentMethods = getPaymentMethods();
      return (
        <div className="bg-tv-card border border-tv-border rounded-xl p-8 text-center">
          <Crown className="w-8 h-8 mx-auto mb-3 text-tv-gold" />
          <p className="text-white font-semibold mb-1">LensConsensus adalah fitur Pro</p>
          <p className="text-tv-muted text-sm mb-4">Upgrade ke SahamLens Pro untuk melihat rapat lengkap LensConsensus pada {symbol}.</p>
          {paymentMethods.length > 0 && (
            <div className="text-left max-w-xs mx-auto mb-4 space-y-1">
              {paymentMethods.map((m) => (
                <p key={m.id} className="text-xs text-tv-muted">
                  <span className="font-bold text-tv-text">{m.label}</span>: {m.accountNumber} (a.n. {m.accountName})
                </p>
              ))}
            </div>
          )}
          <a
            href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Halo, saya sudah transfer untuk upgrade ke SahamLens Pro (${formatRupiah(MONTHLY_PRICE)}/bulan). Ini bukti transfernya.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-tv-gold px-5 py-2.5 text-sm font-bold text-tv-bg hover:opacity-90 transition"
          >
            Kirim Bukti Transfer via WhatsApp
          </a>
        </div>
      );
    }
    // Sisa kasus = kegagalan teknis (mis. 503 provider data down). Untuk user yang
    // sudah login, ini BUKAN soal login - tawarkan muat ulang saja. Halaman ini
    // Server Component, jadi "coba lagi" = memuat ulang rutenya; tautannya
    // disediakan eksplisit alih-alih membiarkan pengguna menebak.
    return (
      <div className="bg-tv-card border border-tv-border rounded-xl">
        <EmptyState
          illustration="empty"
          title={signedIn ? 'Analisis teknikal belum bisa ditampilkan' : 'Masuk dulu untuk lihat analisis lengkap'}
          description={
            signedIn
              ? `Grafik dan indikator dasarnya tetap bisa kamu pakai. Rangkuman LensConsensus untuk ${symbol} sedang gagal dihitung - biasanya sementara. Coba muat ulang sebentar lagi.`
              : 'Grafik dasarnya tetap bisa kamu pakai. Untuk membuka rangkuman LensConsensus lengkap, masuk dulu ya.'
          }
        />
        <div className="flex flex-wrap justify-center gap-3 pb-8 text-center">
          {!signedIn && (
            <Link
              href={`/login?next=/technical/${symbol}`}
              className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-tv-blueHover"
            >
              Masuk untuk buka analisis
            </Link>
          )}
          <Link
            href={`/technical/${symbol}`}
            className="inline-flex items-center gap-2 rounded-full border border-tv-border bg-tv-hover px-5 py-2 text-sm font-semibold text-tv-text transition-colors hover:border-tv-borderLight"
          >
            Muat ulang
          </Link>
        </div>
      </div>
    );
  }

  const analyzers: any[] = Array.isArray(data.analyzers) ? data.analyzers : [];
  const konsensus = data.consensusData || null;
  const dimensi: any[] = Array.isArray(konsensus?.dimensions) ? konsensus.dimensions : [];
  const lockedAnalyzerCount = signedIn
    ? 0
    : analyzers.filter((analyzer) => !isGuestVisibleAnalyzer(analyzer.label)).length;

  // Persentase di bawah adalah hitungan KEPALA analyzer - berbeda dari bull_pct/bear_pct
  // milik konsensus yang menghitung BOBOT DIMENSI. Keduanya sengaja ditampilkan karena
  // selisihnya itulah informasinya: enam analyzer bullish bisa hanya bernilai 21% bobot
  // kalau mereka menumpuk di dimensi yang sedang tidak sepakat.
  const total = analyzers.length;
  const hitung = (d: string) => analyzers.filter((a) => sinyalDariAnalyzer(a.decision) === d).length;
  const buyPct = total > 0 ? Math.round((hitung('BUY') / total) * 100) : 0;
  const sellPct = total > 0 ? Math.round((hitung('SELL') / total) * 100) : 0;
  const holdPct = total > 0 ? Math.round((hitung('HOLD') / total) * 100) : 0;

  // `kategori` (mis. 'STRONG BUY') adalah nilai classifier INTERNAL - dipakai untuk
  // logika (tone warna, threshold) dan tetap dikirim apa adanya di API/CSV export untuk
  // kompatibilitas. Yang dirender ke pengguna SELALU `kategoriLabel` (lihat
  // shared/presentation/signal-labels.ts) supaya "STRONG BUY"/"BUY"/"SELL" tidak
  // terbaca sebagai ajakan transaksi - model ini belum lolos validasi backtest
  // out-of-sample (lihat status validasi di modules/validation).
  const kategori: string = konsensus?.kategori || 'HOLD';
  const kategoriLabel = getKategoriPresentationLabel(kategori);
  const bullPct: number = konsensus?.bull_pct ?? 0;
  const bearPct: number = konsensus?.bear_pct ?? 0;
  const skor: number | null = typeof data.scoring?.total_score === 'number' ? data.scoring.total_score : null;

  // Ringkasan disusun dari angka, bukan dikarang. Sebelumnya kalimat ini datang dari LLM.
  // "Keselarasan" dipakai secara eksplisit, BUKAN "confidence" atau "probabilitas" -
  // bullPct/bearPct adalah bobot dimensi yang sepakat, bukan peluang harga naik/turun.
  const ringkasan = konsensus
    ? `Konsensus ${kategoriLabel}: keselarasan arah antar dimensi ${bullPct}% condong positif berbanding ${bearPct}% condong negatif, dari ${konsensus.total_models ?? total} analyzer (${konsensus.vote ?? '0:0'} berarah). ` +
      `Sisanya ${Math.max(0, 100 - bullPct - bearPct)}% adalah dimensi yang analyzer di dalamnya saling bertentangan, jadi arahnya dinyatakan netral - bukan dipaksa memihak. Angka ini keselarasan antar analyzer, bukan probabilitas harga akan naik atau turun.`
    : 'Data konsensus belum tersedia.';

  const kategoriTone = getKategoriTone(kategori);
  const warnaKategori = kategoriTone === 'positive' ? 'text-tv-green'
    : kategoriTone === 'negative' ? 'text-tv-red'
    : 'text-tv-yellow';

  return (
    <div className="space-y-6">
      <div className="bg-tv-card border border-tv-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-heading font-bold text-tv-text">
            Konsensus Teknikal · {total} analyzer
          </h2>
          <TechnicalExportSection
            symbol={symbol}
            finalSuggestion={kategoriLabel}
            finalSuggestionTone={kategoriTone}
            summaryId={ringkasan}
            buyPct={buyPct}
            sellPct={sellPct}
            holdPct={holdPct}
            waitPct={0}
            agents={analyzers.map((a) => ({ name: String(a.label || '-'), signal: sinyalDariAnalyzer(a.decision) }))}
            score={skor}
          />
        </div>

        {total > 0 && (
          <div className="mb-6">
            <div
              className="flex w-full h-3 rounded-full overflow-hidden mb-3 bg-tv-border"
              role="img"
              aria-label={`Arah analyzer: ${buyPct}% bullish, ${holdPct}% netral, ${sellPct}% bearish`}
            >
              {buyPct > 0 && <div style={{ width: `${buyPct}%` }} className="bg-tv-green transition-[width] duration-1000 ease-settle" />}
              {holdPct > 0 && <div style={{ width: `${holdPct}%` }} className="bg-tv-blue transition-[width] duration-1000 ease-settle" />}
              {sellPct > 0 && <div style={{ width: `${sellPct}%` }} className="bg-tv-red transition-[width] duration-1000 ease-settle" />}
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-number font-bold">
              {buyPct > 0 && <span className="text-tv-green">{buyPct}% BULLISH</span>}
              {holdPct > 0 && <span className="text-tv-blue">{holdPct}% NETRAL</span>}
              {sellPct > 0 && <span className="text-tv-red">{sellPct}% BEARISH</span>}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-tv-border bg-tv-hover p-4">
          <div className={`font-heading text-lg font-bold ${warnaKategori}`}>{kategoriLabel}</div>
          <p className="mt-2 text-sm text-tv-muted leading-relaxed">{ringkasan}</p>
          <p className="mt-3 text-[11px] text-tv-muted">
            Seluruh angka di halaman ini dihitung dari harga dan volume penutupan - tanpa
            model bahasa. Bobot tiap dimensi tertulis di tabel bawah dan dapat diperiksa.
          </p>
        </div>
      </div>

      {dimensi.length > 0 && (
        <div className="bg-tv-card border border-tv-border rounded-xl p-6">
          <h3 className="font-heading font-bold text-tv-text mb-1">Rincian bobot per dimensi</h3>
          <p className="text-sm text-tv-muted mb-4">
            Vote dihitung per dimensi, bukan per analyzer. Tanpa ini empat analyzer yang
            sama-sama turunan rata-rata bergerak akan menguasai suara hanya karena
            jumlahnya, bukan karena bukti yang berbeda.
          </p>
          {signedIn ? (
            <div className="lens-table-sticky-col overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-tv-border text-left text-tv-muted">
                    <th className="pb-2 font-semibold">Dimensi</th>
                    <th className="pb-2 font-semibold text-right">Bobot</th>
                    <th className="pb-2 font-semibold text-right">Arah</th>
                    <th className="pb-2 font-semibold text-right">Analyzer berarah</th>
                  </tr>
                </thead>
                <tbody>
                  {dimensi.map((d: any) => (
                    <tr key={d.dimension} className="border-b border-tv-border/50 last:border-0">
                      <td className="py-2 font-semibold text-tv-text">{d.dimension}</td>
                      <td className="py-2 text-right font-number text-tv-muted">{d.weight}</td>
                      <td className={`py-2 text-right font-number font-bold ${
                        d.direction === 'BULLISH' ? 'text-tv-green'
                          : d.direction === 'BEARISH' ? 'text-tv-red'
                          : 'text-tv-muted'
                      }`}>{d.direction}</td>
                      <td className="py-2 text-right font-number text-tv-muted">{d.votedAnalyzers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-tv-border bg-tv-bg px-4 py-5 text-center">
              <Lock className="mx-auto mb-2 h-5 w-5 text-tv-yellow" />
              <p className="text-sm font-semibold text-tv-text">Rincian bobot tersedia setelah masuk</p>
              <p className="mt-1 text-xs text-tv-muted">Masuk untuk memeriksa bobot, arah, dan analyzer pada setiap dimensi.</p>
              <Link
                href={`/login?next=/technical/${symbol}`}
                className="mt-3 inline-flex items-center gap-1 rounded-full border border-tv-yellow/40 bg-tv-yellow/10 px-3 py-1.5 text-xs font-bold text-tv-yellow transition-colors hover:text-white"
              >
                <LogIn className="h-3.5 w-3.5" /> Masuk untuk membuka
              </Link>
            </div>
          )}
        </div>
      )}

      {lockedAnalyzerCount > 0 && (
        <div className="rounded-xl border border-tv-yellow/30 bg-tv-yellow/10 px-4 py-3 text-sm text-tv-yellow">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Lock className="h-4 w-4" />
            <span><strong>{lockedAnalyzerCount} indikator lanjutan</strong> terkunci untuk pengunjung.</span>
            <Link href={`/login?next=/technical/${symbol}`} className="font-bold underline underline-offset-2 hover:text-white">
              Masuk untuk membuka
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analyzers.map((a: any, idx: number) => {
          const sinyal = sinyalDariAnalyzer(a.decision);
          const locked = !signedIn && !isGuestVisibleAnalyzer(a.label);

          if (locked) {
            return (
              <div key={idx} className="relative overflow-hidden rounded-lg border border-tv-border bg-tv-hover p-4">
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-tv-bg/70 backdrop-blur-[3px]">
                  <Link
                    href={`/login?next=/technical/${symbol}`}
                    className="inline-flex items-center gap-1 rounded-full border border-tv-yellow/40 bg-tv-yellow/10 px-3 py-1.5 text-xs font-bold text-tv-yellow transition-colors hover:text-white"
                  >
                    <Lock className="h-3.5 w-3.5" /> Masuk
                  </Link>
                </div>
                <div className="select-none blur-sm" aria-hidden="true">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-heading text-sm font-bold text-tv-text">{a.label}</h3>
                    <span className="lens-chip shrink-0 rounded border border-tv-yellow/30 bg-tv-yellow/20 px-2 py-0.5 font-number font-semibold text-tv-yellow">
                      {getAnalyzerDirectionLabel(sinyal)}
                    </span>
                  </div>
                  <p className="font-number text-sm text-tv-text">{a.value ?? '-'}</p>
                  <p className="mt-1 text-[11px] text-tv-muted">Kekuatan rule {a.confidence ?? '-'} / 100</p>
                </div>
              </div>
            );
          }

          return (
            <div key={idx} className="bg-tv-hover border border-tv-border rounded-lg p-4 transition-colors hover:border-tv-borderLight">
              <div className="flex justify-between items-center gap-2 mb-2">
                <h3 className="font-heading font-bold text-tv-text text-sm">{a.label}</h3>
                <span className={`lens-chip shrink-0 px-2 py-0.5 rounded font-number font-semibold ${
                  sinyal === 'BUY' ? 'bg-tv-green/20 text-tv-green border border-tv-green/30' :
                  sinyal === 'SELL' ? 'bg-tv-red/20 text-tv-red border border-tv-red/30' :
                  'bg-tv-border text-tv-muted'
                }`}>
                  {getAnalyzerDirectionLabel(sinyal)}
                </span>
              </div>
              <p className="font-number text-sm text-tv-text">{a.value ?? '-'}</p>
              {typeof a.confidence === 'number' && a.confidence > 0 && (
                <p className="mt-1 text-[11px] text-tv-muted">Kekuatan rule {a.confidence} / 100</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LensConsensusAnalysisSkeleton({ symbol }: { symbol: string }) {
  return (
    // Kerangka mengikuti bentuk hasil aslinya (batang suara + kartu agen), bukan
    // kotak-kotak kosong berdenyut yang tidak menyerupai apa pun. Tunggu 5-10 detik
    // itu lama - LoadingFact mengisi jeda itu dengan sesuatu yang berguna.
    <div className="space-y-6">
      <div className="bg-tv-card border border-tv-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-32 h-4" />
          <Skeleton variant="text" className="w-20 h-4" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-16 w-full" />
        <p className="text-center text-xs text-tv-muted">
          LensConsensus sedang merapatkan {symbol} - biasanya 5-10 detik.
        </p>
        <LoadingFact />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

export default async function TechnicalPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = await params;
  const code = normalizeTechnicalSymbol(rawSymbol);
  const isIndex = code === '^JKSE';
  if (!code) notFound();
  if (!isIndex && !getEmitenSymbolSet().has(code)) notFound();
  const symbol = isIndex ? '^JKSE' : `${code}.JK`;

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <ClientHeader symbol={symbol} />
      
      {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental (sebelumnya
          max-w-7xl = 1280px). */}
      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        <div className="flex items-center gap-3 mb-8">
          {/* Ikon Users generik (identik untuk semua emiten) diganti avatar per-emiten. */}
          <TickerAvatar symbol={symbol} size="lg" />
          <div>
            <h1 className="lens-page-title">{isIndex ? 'LensTechnical: IHSG' : `LensConsensus: ${symbol}`}</h1>
            <p className="text-sm text-tv-muted">
              {isIndex ? 'Chart dan indikator teknikal Indeks Harga Saham Gabungan' : 'Vote analyzer teknikal, ditimbang per dimensi'}
            </p>
          </div>
        </div>

        {!isIndex && <MarketDataIntegrityBanner ticker={symbol} />}

        <StockChartPanel symbol={symbol} />

        {/* LensFlow - arus dana asing. Sumber utamanya Net Foreign Buy/Sell RESMI BEI
            (data/foreign-flow/, lihat modules/market/service/idx-foreign-flow.service.ts);
            emiten yang artefaknya belum tersinkron otomatis jatuh ke proxy CMF Yahoo
            dengan label berbeda. IHSG dikecualikan: indeks bukan emiten, Bursa tidak
            mencatat ForeignBuy/ForeignSell untuknya. */}
        {!isIndex && <BandarFlowPro symbol={symbol} />}

        {!isIndex && SHOW_BROKER_DISTRIBUTION_PANEL && (
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
            <BrokerDistributionPanel symbol={symbol} />
          </Suspense>
        )}

        {isIndex ? (
          <div className="rounded-xl border border-tv-border bg-tv-card p-4 text-sm leading-relaxed text-tv-muted">
            IHSG adalah indeks pasar, bukan saham emiten. Karena itu halaman ini menampilkan chart, tren, momentum, dan volatilitas indeks tanpa fundamental perusahaan, broker summary, TP/CL saham, atau rekomendasi beli per lot.
          </div>
        ) : (
          <Suspense fallback={<LensConsensusAnalysisSkeleton symbol={symbol} />}>
            <LensConsensusAnalysisDisplay symbol={symbol} />
          </Suspense>
        )}

        <TechnicalAnalysisSuite symbol={symbol} />
      </PageContainer>
    </div>
  );
}
