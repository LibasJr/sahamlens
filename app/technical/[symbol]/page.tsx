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
import { Card, InsightRow, PageContainer, SectionHeader, Skeleton, StatusMeta, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';
import TechnicalExportSection from '@/components/export/TechnicalExportSection';
import MarketDataIntegrityBanner from '@/components/MarketDataIntegrityBanner';
import { JourneyBeacon, JourneyVisibilityBeacon } from '@/components/analytics/JourneyBeacon';
import BrokerDistributionPanel from './BrokerDistributionPanel';
import BandarFlowPro from '@/components/BandarFlowPro';
import TechnicalAnalysisSuite from '@/components/technical/TechnicalAnalysisSuite';
import { getTrustedAppOrigin } from '@/shared/http/server-origin';
import { getEmitenSymbolSet, loadEmitenList } from '@/shared/market/emiten-list';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getSession } from '@/modules/user';
import { cookies } from 'next/headers';
import { getAnalyzerDirectionLabel, getKategoriPresentationLabel, getKategoriTone } from '@/shared/presentation/signal-labels';
import { susunTemuanDimensi, type TemuanDimensi } from '@/shared/presentation/stock-brief';
import { describeFreshness } from '@/shared/presentation/freshness-labels';



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
        <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-8 text-center">
          <LogIn className="w-8 h-8 mx-auto mb-3 text-tv-blue" />
          <p className="text-white font-semibold mb-1">Masuk dulu, yuk, untuk lihat analisis lengkap</p>
          <p className="text-tv-muted text-sm mb-4">Grafik dan indikator dasar tetap bisa kamu lihat gratis. Untuk rangkuman LensConsensus yang lebih lengkap, masuk dulu supaya datanya bisa kami tampilkan.</p>
          <Link href={`/login?next=/technical/${symbol}`} className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2.5 text-sm font-bold text-white hover:bg-tv-blueHover transition">
            Masuk sekarang
          </Link>
        </Card>
      );
    }
    if (!signedIn && status === 429) {
      return (
        <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-8 text-center">
          <LogIn className="w-8 h-8 mx-auto mb-3 text-tv-blue" />
          <p className="text-white font-semibold mb-1">Jatah coba LensConsensus kamu sudah habis</p>
          <p className="text-tv-muted text-sm mb-4">Masuk dulu untuk melanjutkan LensConsensus dan membuka analisis lengkap {symbol.replace(/\.JK$/i, '')}.</p>
          <Link href={`/login?next=/technical/${symbol}`} className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2.5 text-sm font-bold text-white hover:bg-tv-blueHover transition">
            Masuk untuk lanjut
          </Link>
        </Card>
      );
    }
    if (status === 402) {
      const paymentMethods = getPaymentMethods();
      return (
        <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-8 text-center">
          <Crown className="w-8 h-8 mx-auto mb-3 text-tv-gold" />
          <p className="text-white font-semibold mb-1">LensConsensus adalah fitur Pro</p>
          <p className="text-tv-muted text-sm mb-4">Upgrade ke SahamLens Pro untuk melihat rapat lengkap LensConsensus pada {symbol.replace(/\.JK$/i, '')}.</p>
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
        </Card>
      );
    }
    // Sisa kasus = kegagalan teknis (mis. 503 provider data down). Untuk user yang
    // sudah login, ini BUKAN soal login - tawarkan muat ulang saja. Halaman ini
    // Server Component, jadi "coba lagi" = memuat ulang rutenya; tautannya
    // disediakan eksplisit alih-alih membiarkan pengguna menebak.
    return (
      <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border">
        <EmptyState
          illustration="empty"
          title={signedIn ? 'Analisis teknikal belum bisa ditampilkan' : 'Masuk dulu untuk lihat analisis lengkap'}
          description={
            signedIn
              ? `Grafik dan indikator dasarnya tetap bisa kamu pakai. Rangkuman LensConsensus untuk ${symbol.replace(/\.JK$/i, '')} sedang gagal dihitung - biasanya sementara. Coba muat ulang sebentar lagi.`
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
      </Card>
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

  // Semuanya dari payload yang SAMA (lihat getKonsensusData di atas) - tidak ada
  // pengambilan data tambahan untuk blok ringkasan.
  const harga: number | null = typeof data.stock?.current_price === 'number' && Number.isFinite(data.stock.current_price)
    ? data.stock.current_price
    : null;
  const perubahanPct: number | null = typeof data.stock?.change_pct === 'number' && Number.isFinite(data.stock.change_pct)
    ? data.stock.change_pct
    : null;
  const coveragePct: number | null = typeof data.scoring?.coverage_pct === 'number' ? Math.round(data.scoring.coverage_pct) : null;

  /** Skor kelompok dinormalkan ke 0-100 memakai bobot yang BENAR-BENAR punya data.
   *
   * Penyebutnya `available_max`, bukan bobot yang dideklarasikan (40/30/30). Itu bukan
   * pilihan gaya: `combine()` di scoring.service.ts sudah menormalkan skor kelompok atas
   * bobot yang tersedia, jadi `technical_score / 40` hanya benar saat coverage 100% dan
   * meremehkan kelompok berdata lengkap di semua kasus lain (temuan H-03 audit
   * kuantitatif 2026-08-11 - kesalahan yang sama pernah membuat calibration lab memilih
   * bobot di atas model yang salah spesifikasi).
   *
   * Kelompok tanpa data sama sekali (availableMax 0) menghasilkan null, bukan 0: nol
   * berarti "dinilai dan hasilnya nol", dan itu klaim yang tidak kita punya. */
  const normalkanSkorKelompok = (skorKelompok: unknown, bobotTersedia: unknown): number | null => {
    if (typeof skorKelompok !== 'number' || !Number.isFinite(skorKelompok)) return null;
    if (typeof bobotTersedia !== 'number' || !Number.isFinite(bobotTersedia) || bobotTersedia <= 0) return null;
    return Math.round((skorKelompok / bobotTersedia) * 100);
  };

  // Tiga kelompok, bukan empat. LensScore memang terdiri dari Technical / Fundamental /
  // Flow; "Valuation" adalah SUB-faktor di dalam Fundamental (scoring.detail.valuasi),
  // bukan kelompok sejajar. Menampilkannya berdampingan seolah setara akan menyatakan
  // pembobotan yang tidak dipakai model mana pun. Valuasi punya halamannya sendiri
  // (tab Valuation) dan label konsensusnya sendiri di /fundamental.
  const subSkor: { label: string; nilai: number | null }[] = data.scoring
    ? [
        { label: 'Technical', nilai: normalkanSkorKelompok(data.scoring.technical_score, data.scoring.available_max?.technical) },
        { label: 'Fundamental', nilai: normalkanSkorKelompok(data.scoring.fundamental_score, data.scoring.available_max?.fundamental) },
        { label: 'Flow', nilai: normalkanSkorKelompok(data.scoring.flow_score, data.scoring.available_max?.flow) },
      ]
    : [];

  /** Umur data ditampilkan apa adanya, termasuk saat basi (PRD §36). Kalimatnya sama
   *  persis dengan permukaan lain yang menampilkan kesegaran - lihat
   *  shared/presentation/freshness-labels.ts. */
  const kesegaran = describeFreshness(data._meta?.freshness, data._meta?.dataTimestamp);

  const temuan = susunTemuanDimensi(dimensi);
  const directionGap = bullPct - bearPct;
  const primaryRead = directionGap >= 20
    ? 'Arah teknikal lebih banyak condong positif, tetapi keselarasan analyzer tetap perlu dibaca bersama tren, volume, dan risiko.'
    : directionGap <= -20
      ? 'Arah teknikal lebih banyak condong negatif. Cari penyebab kelemahan dan level risiko sebelum mempertimbangkan skenario pemulihan.'
      : 'Arah teknikal masih campuran. Belum ada dominasi yang cukup lebar antar dimensi, jadi konteks harga dan flow menjadi lebih penting.';

  return (
    <div className="space-y-6">
      {/* KESIMPULAN -> ALASAN -> BUKTI (PRD §16-17).
          Harga, LensScore, dan rincian kelompoknya SEMUANYA berasal dari payload
          /api/stock yang sudah diambil di atas - blok ini tidak menambah satu request pun. */}
      <section aria-labelledby="technical-brief-title" className="border-y border-tv-border/70 py-5">
        <div className="lens-eyebrow mb-1.5 text-tv-muted">Ringkasan sebelum indikator</div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 id="technical-brief-title" className="font-heading text-xl font-bold text-tv-text">Yang penting dari {symbol.replace('.JK', '')}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-tv-muted">{primaryRead}</p>
          </div>
          <div className="lens-meta font-semibold text-tv-green">Rule-based · dapat diaudit</div>
        </div>

        {/* Harga & skor berdampingan: dua angka yang paling dicari, sebelum apa pun. */}
        <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="lens-meta font-semibold text-tv-muted">Harga</div>
            {harga != null ? (
              <>
                <div className="lens-metric-lg mt-1 text-tv-text">Rp{harga.toLocaleString('id-ID')}</div>
                {perubahanPct != null && (
                  <div className={`mt-1 font-number text-sm font-bold ${perubahanPct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                    {perubahanPct >= 0 ? '+' : ''}{perubahanPct.toFixed(2)}%
                  </div>
                )}
              </>
            ) : (
              <div className="mt-1 text-sm text-tv-muted">Harga tidak tersedia dari sumber data</div>
            )}
          </div>
          <div>
            <div className="lens-meta font-semibold text-tv-muted">LensScore</div>
            <div className="lens-metric-lg mt-1 text-tv-text">
              {skor ?? 'N/A'}{skor != null && <span className="lens-meta font-medium text-tv-muted"> / 100</span>}
            </div>
            {/* GEMBOK TAMU (2026-08-23). Angka LensScore sengaja TETAP terbuka; yang
                dikunci justru tafsirnya. Angka tanpa arti jauh lebih memancing daripada
                halaman kosong - pengunjung melihat 78/100 tapi tidak tahu itu BUY atau
                HOLD, dan itulah alasan mendaftar. Halaman ini juga tetap punya isi nyata
                untuk mesin pencari. */}
            {signedIn ? (
              <div className={`mt-1 text-sm font-bold ${warnaKategori}`}>{kategoriLabel}</div>
            ) : (
              <Link
                href={`/login?next=/technical/${symbol}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-tv-blue hover:underline"
              >
                <Lock className="h-3.5 w-3.5" /> Masuk untuk lihat kesimpulan
              </Link>
            )}
            {/* Penyangkalan ini menempel pada SKORNYA, bukan disimpan di paragraf jauh di
                bawah. Label seperti "BUY" dibaca sebagai ajakan transaksi kalau tidak ada
                yang menyanggahnya di tempat yang sama - dan model ini belum lolos
                validasi backtest out-of-sample. */}
            <div className="mt-0.5 text-xs text-tv-muted">Informasi riset, bukan probabilitas harga.</div>
          </div>
        </div>

        {/* Rincian kelompok LensScore. Penyebutnya `available_max`, BUKAN bobot yang
            dideklarasikan - lihat temuan H-03 di scoring.service.ts: membagi dengan
            40/30/30 saat coverage < 100% meremehkan kelompok yang datanya justru lengkap.
            Kelompok tanpa data sama sekali ditulis N/A, bukan 0. */}
        {subSkor.length > 0 && (
          <div className="mt-4 grid grid-cols-3 border-y border-tv-border/60 sm:divide-x sm:divide-tv-border/60">
            {subSkor.map((bagian, index) => {
              // Kelompok pertama terbuka sebagai contoh bentuknya; sisanya dikunci.
              const terkunci = !signedIn && index > 0;
              return (
                <div key={bagian.label} className={index === 0 ? 'py-3 sm:pr-4' : index === subSkor.length - 1 ? 'py-3 pl-3 sm:pl-4' : 'py-3 pl-3 sm:px-4'}>
                  <div className="lens-meta font-semibold text-tv-muted">{bagian.label}</div>
                  {terkunci ? (
                    <Link
                      href={`/login?next=/technical/${symbol}`}
                      className="lens-metric mt-1 inline-flex items-center gap-1.5 text-tv-blue hover:underline"
                    >
                      <Lock className="h-4 w-4" />
                    </Link>
                  ) : (
                    <div className="lens-metric mt-1 text-tv-text">
                      {bagian.nilai ?? 'N/A'}{bagian.nilai != null && <span className="lens-meta font-medium text-tv-muted"> / 100</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {temuan.length > 0 && (() => {
          // GEMBOK TAMU (2026-08-23). Temuan adalah bagian paling berharga di halaman ini -
          // ia menjawab "kenapa", bukan cuma "berapa". Satu ditampilkan utuh supaya
          // pengunjung tahu bentuk dan kedalamannya; sisanya dikunci dengan jumlahnya
          // disebutkan, karena "4 temuan lainnya" jauh lebih memancing daripada tombol
          // masuk tanpa konteks.
          const terlihat = signedIn ? temuan : temuan.slice(0, 1);
          const tersisa = temuan.length - terlihat.length;
          return (
            <div className="mt-4">
              {terlihat.map((item) => (
                <InsightRow key={item.judul} direction={item.arah} title={item.judul} detail={item.bukti} />
              ))}
              {tersisa > 0 && (
                <Link
                  href={`/login?next=/technical/${symbol}`}
                  className="mt-2 flex items-center justify-center gap-2 rounded-md border border-dashed border-tv-border px-3 py-3 text-sm font-bold text-tv-blue transition hover:border-tv-blue hover:bg-tv-hover"
                >
                  <Lock className="h-4 w-4" />
                  Masuk untuk melihat {tersisa} temuan lainnya
                </Link>
              )}
            </div>
          );
        })()}

        {/* Baris kepercayaan (PRD SEC.36): umur data ditulis apa adanya, termasuk saat basi.
            Satu baris, bukan tiga sel bergaris - ini konteks yang menyertai skor, dan
            memberinya bingkai setara membuatnya terbaca seperti metrik utama. */}
        <StatusMeta
          className="mt-4 border-t border-tv-border/60 pt-3"
          items={[
            { label: `Keselarasan arah ${bullPct}% positif · ${bearPct}% negatif` },
            {
              label: `Kelengkapan data ${coveragePct != null ? `${coveragePct}%` : 'N/A'}`,
              title: 'Bagian bobot skor yang benar-benar punya data.',
            },
            {
              label: kesegaran.label,
              tone: kesegaran.tone.includes('yellow') ? 'caution' : 'neutral',
              title: kesegaran.detail,
            },
          ]}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-heading font-bold text-tv-text">
            Konsensus Teknikal · {total} analyzer
          </h2>
          {/* GEMBOK TAMU (2026-08-23). Mengunduh hasil analisis adalah fitur yang dibawa
              pulang - kalau tamu bisa mengekspornya, tidak ada yang tersisa untuk
              diperoleh dengan mendaftar. */}
          {signedIn && <TechnicalExportSection
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
          />}
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
          <p className="mt-3 lens-meta text-tv-muted">
            Seluruh angka di halaman ini dihitung dari harga dan volume penutupan - tanpa
            model bahasa. Bobot tiap dimensi tertulis di tabel bawah dan dapat diperiksa.
          </p>
        </div>
      </section>

      {dimensi.length > 0 && (
        <section className="space-y-4">
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
        </section>
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
                  <p className="mt-1 lens-meta text-tv-muted">Kekuatan rule {a.confidence ?? '-'} / 100</p>
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
                <p className="mt-1 lens-meta text-tv-muted">Kekuatan rule {a.confidence} / 100</p>
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
      <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-32 h-4" />
          <Skeleton variant="text" className="w-20 h-4" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-16 w-full" />
        <p className="text-center text-xs text-tv-muted">
          LensConsensus sedang merapatkan {symbol.replace(/\.JK$/i, '')} - biasanya 5-10 detik.
        </p>
        <LoadingFact />
      </Card>
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
  const emiten = isIndex ? null : loadEmitenList().find((item) => item.symbol === code) ?? null;

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <ClientHeader symbol={symbol} />
      
      {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental (sebelumnya
          max-w-7xl = 1280px). */}
      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-10">
        <div className="mb-2 flex items-center gap-3">
          <TickerAvatar symbol={symbol} size="lg" />
          <div className="min-w-0">
            <div className="lens-meta mb-0.5 font-bold uppercase tracking-[0.16em] text-tv-muted">LensTechnical</div>
            <h1 className="lens-page-title">{isIndex ? 'IHSG' : code}</h1>
            <p className="truncate text-sm text-tv-muted">
              {isIndex ? 'Indeks Harga Saham Gabungan' : (emiten?.name || 'Analisis saham IDX')}
            </p>
          </div>
        </div>

        {/* "Tindakan berguna pertama" dalam metrik beta (PRD, Beta evaluation) berarti
            halaman analisis EMITEN. IHSG dikecualikan: indeks tidak punya fundamental
            perusahaan maupun arus dana asing, jadi membukanya bukan langkah riset yang
            sama - menghitungnya akan memendekkan mediannya dengan kunjungan yang tidak
            menjawab pertanyaan siapa pun. */}
        {!isIndex && <JourneyBeacon event="stock_analysis_view" surface="technical" />}

        {!isIndex && <MarketDataIntegrityBanner ticker={symbol} />}

        {isIndex ? (
          <p className="lens-body-sm border-t border-tv-border pt-4 text-tv-muted">
            IHSG adalah indeks pasar, bukan saham emiten. Karena itu halaman ini menampilkan chart, tren, momentum, dan volatilitas indeks tanpa fundamental perusahaan, broker summary, TP/CL saham, atau rekomendasi beli per lot.
          </p>
        ) : (
          <Suspense fallback={<LensConsensusAnalysisSkeleton symbol={symbol} />}>
            <LensConsensusAnalysisDisplay symbol={symbol} />
          </Suspense>
        )}

        {/* Ambang "ringkasan -> bukti". Diukur saat blok ini BENAR-BENAR terlihat, bukan
            saat halaman dimuat: bukti berada di bawah lipatan, jadi memuat halaman bukan
            berarti menembus ke sana. */}
        {!isIndex && <JourneyVisibilityBeacon event="stock_evidence_view" surface="technical" />}

        <SectionHeader
          className="pt-2"
          eyebrow="Bukti & detail"
          title="Periksa chart, flow, dan indikator"
          lede="Ringkasan di atas adalah pintu masuk. Bagian berikut menunjukkan data yang membentuk konteksnya."
        />

        <StockChartPanel symbol={symbol} />

        {/* LensFlow - arus dana asing. Sumber utamanya Net Foreign Buy/Sell RESMI BEI
            (data/foreign-flow/, lihat modules/market/service/idx-foreign-flow.service.ts);
            emiten yang artefaknya belum tersinkron otomatis jatuh ke proxy CMF Yahoo
            dengan label berbeda. IHSG dikecualikan: indeks bukan emiten, Bursa tidak
            mencatat ForeignBuy/ForeignSell untuknya.

            Jangkarnya dipasang di <section> ini, BUKAN di dalam BandarFlowPro: panel itu
            merender tiga pohon berbeda (memuat / gagal / data), jadi id di dalamnya akan
            hilang persis saat tautan "Flow" paling mungkin diklik - selama data masih
            dimuat. `lens-anchor-offset` mencegah header sticky menutupi judulnya. */}
        {!isIndex && (
          <section id="lens-flow" aria-labelledby="lens-flow-title" className="lens-anchor-offset">
            <SectionHeader
              className="mb-3"
              id="lens-flow-title"
              eyebrow="Flow"
              title={`Arus dana asing ${code}`}
              lede="Net asing, partisipasi, dan pola akumulasi/distribusi. Sumber resmi Bursa ditandai terpisah dari sinyal proxy - keduanya tidak dibaca dengan bobot yang sama."
            />
            <BandarFlowPro symbol={symbol} />
          </section>
        )}

        {!isIndex && SHOW_BROKER_DISTRIBUTION_PANEL && (
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
            <BrokerDistributionPanel symbol={symbol} />
          </Suspense>
        )}

        <TechnicalAnalysisSuite symbol={symbol} />
      </PageContainer>
    </div>
  );
}
