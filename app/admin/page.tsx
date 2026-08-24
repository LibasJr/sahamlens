import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Activity, ArrowLeft, BarChart3, Bot, Building2, FileSpreadsheet, MessageSquare, RefreshCw, ShieldCheck, Sparkles, Target, Timer, TrendingUp, Users, Waves } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getActiveUsers } from '@/shared/auth/presence';
import { getAdminUserActivityReport, getProductFunnelSummary, getRecentAuthEvents, type AuthEventType } from '@/modules/user/repository/user.repository';
import { getResearchJourneySummary } from '@/modules/user/repository/product-journey.repository';
import { loadPanel, panelValueOr } from '@/shared/presentation/panel-result';
import { Card, EmptyState } from '@/components/ui';
import ExportButton from './ExportButton';
import SetProForm from './SetProForm';
import CreateTestUserForm from './CreateTestUserForm';
import ChangeSecretForm from './ChangeSecretForm';
import { listRecentPaymentOrders } from '@/modules/payment/repository/payment-order.repository';
import { formatRupiah } from '@/shared/config/pricing';

// Root layout menyetel robots index:true untuk seluruh situs. Halaman admin ikut
// mewarisinya - meski pengunjung non-admin dialihkan, tidak ada alasan rute ini
// mengundang perayapan sama sekali.
export const metadata = {
  robots: { index: false, follow: false },
};

/** Jam WIB eksplisit. Halaman ini Server Component, jadi toLocaleTimeString tanpa
 *  timeZone memakai zona waktu SERVER - di Vercel itu UTC, sehingga jam yang
 *  ditampilkan meleset 7 jam dari WIB sambil tetap berformat Indonesia. */
function jamWib(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'waktu tidak terbaca';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
}

function waktuWib(iso: string | null): string {
  if (!iso) return 'Belum tercatat';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'waktu tidak terbaca';
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  }) + ' WIB';
}

function formatDurasi(sec?: number): string {
  if (sec == null || isNaN(sec) || sec < 60) return '< 1 menit';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} menit`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h} jam ${remM} mnt` : `${h} jam`;
}

function authEventLabel(eventType: AuthEventType): string {
  return eventType === 'signup' ? 'Daftar' : eventType === 'verify' ? 'Verifikasi' : 'Login';
}

function funnelFeatureLabel(feature: string): string {
  const labels: Record<string, string> = {
    fundamental_indicators: 'Indikator fundamental terkunci',
    intrinsic_valuation: 'Rincian valuasi & Penjelasan LensAI',
    screener_results: 'Hasil lengkap LensScanner',
    signup_direct: 'Pendaftaran langsung',
  };
  return labels[feature] ?? feature;
}

export default async function AdminPage() {
  if (!(await isAdminServer())) {
    redirect('/admin-login');
  }

  // "Aktif sekarang" - presence Redis (lihat shared/auth/presence.ts), TTL 5 menit -
  // BUKAN query database, langsung dari sesi yang benar-benar melakukan request.
  // Tiap panel dimuat terisolasi. Sebelum ini keenamnya berbagi satu Promise.all telanjang,
  // jadi satu yang reject menjatuhkan SELURUH halaman ke app/error.tsx - termasuk Payment
  // Order dan Kesehatan Operasional yang tidak ada hubungannya. Terjadi 20 Agustus 2026:
  // product_journey_events sampai ke produksi lewat deploy otomatis sebelum migrasi 010
  // dijalankan, dan /admin ikut hilang seluruhnya justru saat dibutuhkan untuk diagnosa.
  const [activeUsersPanel, activityPanel, authEventsPanel, funnelPanel, journeyPanel, paymentsPanel] = await Promise.all([
    loadPanel('Aktivitas Pengguna', () => getActiveUsers()),
    loadPanel('Aktivitas Pengguna', () => getAdminUserActivityReport()),
    loadPanel('Jejak autentikasi terbaru', () => getRecentAuthEvents()),
    loadPanel('Funnel pendaftaran', () => getProductFunnelSummary()),
    loadPanel('Perjalanan riset (beta)', () => getResearchJourneySummary()),
    loadPanel('Payment Order Terbaru', () => listRecentPaymentOrders(20)),
  ]);

  // Nilai cadangan hanya untuk panel yang bentuk kosongnya memang punya arti ("belum ada
  // data"). Pesan galatnya tetap dirender di panelnya masing-masing, jadi kosong-karena-
  // gagal tidak pernah terbaca sebagai kosong-karena-belum-ada.
  const activeUsers = panelValueOr(activeUsersPanel, [] as Awaited<ReturnType<typeof getActiveUsers>>);
  const activityReport = panelValueOr(activityPanel, {
    summary: { active24h: 0, active7d: 0, active30d: 0, inactive30d: 0 },
    inactiveUsers: [],
  });
  const recentAuthEvents = panelValueOr(authEventsPanel, [] as Awaited<ReturnType<typeof getRecentAuthEvents>>);
  const recentPayments = panelValueOr(paymentsPanel, [] as Awaited<ReturnType<typeof listRecentPaymentOrders>>);
  const snapshotAt = new Date().toISOString();

  // Rekap peran: 12 baris tabel tidak langsung memberi tahu komposisinya, dan itu
  // yang biasanya dicari admin saat membuka halaman ini.
  const byRole = activeUsers.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});
  const rekapPeran = Object.entries(byRole)
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => `${n} ${role}`)
    .join(', ');

  return (
    <div className="min-h-screen bg-tv-bg text-tv-text p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-tv-text">SahamLens Admin Panel</h1>
          <ExportButton />
        </div>
        <SetProForm />
        <Card as="div" padding="none" radius="lg" elevation="none" overflow="hidden" highlight={false} className="mb-8 border-tv-border">
          <div className="border-b border-tv-border px-5 py-4">
            <h2 className="font-heading text-lg font-bold text-tv-text">Payment Order Terbaru</h2>
            <p className="mt-1 text-xs text-tv-muted">Audit klaim transfer sebelum aktivasi Pro. Status PAID hanya muncul setelah rekonsiliasi admin berhasil satu transaksi dengan entitlement.</p>
          </div>
          {!paymentsPanel.ok ? (
            <p className="px-5 py-5 text-sm text-tv-yellow">{paymentsPanel.message}</p>
          ) : recentPayments.length === 0 ? (
            <p className="px-5 py-5 text-sm text-tv-muted">Belum ada payment order.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-tv-bg text-tv-muted"><tr><th className="px-4 py-3">Waktu</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Paket</th><th className="px-4 py-3">Nominal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Referensi</th></tr></thead>
                <tbody>
                  {recentPayments.map((order) => (
                    <tr key={order.id} className="border-t border-tv-border">
                      <td className="whitespace-nowrap px-4 py-3 text-tv-muted">{waktuWib(order.createdAt)}</td>
                      <td className="px-4 py-3 text-tv-text">{order.email ?? '—'}</td>
                      <td className="px-4 py-3 font-number text-tv-text">{order.planCode}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-number text-tv-text">{order.amountIdr == null ? '—' : formatRupiah(order.amountIdr)}</td>
                      <td className="px-4 py-3 font-bold text-tv-text">{order.status}</td>
                      <td className="max-w-[260px] truncate px-4 py-3 font-number text-tv-muted" title={order.externalReference ?? ''}>{order.externalReference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <CreateTestUserForm />
        <ChangeSecretForm />

        {/* Dua pintu masuk ini sebelumnya bertumpuk selebar penuh dengan mb-8
            masing-masing, mendorong tabel "Aktif Sekarang" jauh ke bawah lipatan. */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/admin/infographic-studio"
          className="flex items-start gap-3 rounded-xl border border-tv-blue/40 bg-gradient-to-br from-tv-card to-blue-950/20 p-5 hover:border-tv-blue hover:bg-tv-hover transition-all shadow-sm"
        >
          <div className="rounded-lg bg-tv-blue/20 p-2 text-tv-blue">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-bold text-tv-text">Infographic Studio 360°</h2>
              <span className="rounded-full bg-tv-blue/20 px-2 py-0.5 text-[10px] font-bold text-tv-blue">Baru</span>
            </div>
            <p className="text-sm text-tv-muted mt-1">
              Generator Factsheet Finansial &amp; Infografis Saham (Fundamental, Teknikal, Moat, Kepemilikan) siap ekspor HD PNG.
            </p>
          </div>
        </Link>

        <Link
          href="/admin/calibration"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-accent/10 p-2 text-tv-accent">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">LensRadar Calibration Lab</h2>
            <p className="text-sm text-tv-muted mt-1">
              Audit bucket LensScore, t-test edge T+20, simulasi threshold, dan rekomendasi ambang AI (saat ini dibekukan).
            </p>
          </div>
        </Link>

        <Link
          href="/admin/decision-lab"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 transition-colors hover:border-tv-borderLight hover:bg-tv-hover"
        >
          <div className="rounded-lg bg-tv-green/10 p-2 text-tv-green"><Bot className="h-5 w-5" /></div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">AI Decision Lab</h2>
            <p className="mt-1 text-sm text-tv-muted">Shadow signal, sizing berbasis risiko, paper order dengan konfirmasi manusia, dan audit trail internal.</p>
          </div>
        </Link>

        {/* Bertetangga dengan Calibration Lab: keduanya menjawab pertanyaan yang sama -
            apakah LensScore benar-benar punya edge - dari sisi yang berbeda. Halaman ini
            DULU publik di /transparency; sejak 23 Agustus 2026 ia internal, dan alamat
            lamanya dialihkan ke sini lewat next.config.mjs. */}
        <Link
          href="/admin/transparency"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-yellow/10 p-2 text-tv-yellow">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Transparansi Validasi LensRadar</h2>
            <p className="text-sm text-tv-muted mt-1">
              Bukti forward per bucket LensScore, uji signifikansi, dan rekonsiliasi harga penutupan lintas sumber.
            </p>
          </div>
        </Link>

        <Link
          href="/admin/fundamental-backfill"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-blue/10 p-2 text-tv-blue">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Fundamental Backfill</h2>
            <p className="text-sm text-tv-muted mt-1">
              Upload/paste CSV fundamental point-in-time, Dry Run, lalu insert append-only ke histori.
            </p>
          </div>
        </Link>

        <Link
          href="/admin/financial-integrity"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-purple/10 p-2 text-tv-purple">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Financial Integrity & Adoption Gate</h2>
            <p className="text-sm text-tv-muted mt-1">
              Uji dampak candidate macro dan kematangan bank evidence tanpa auto-adoption ke valuation/LensScore.
            </p>
          </div>
        </Link>

        <Link
          href="/admin/macro-assumptions"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-blue/10 p-2 text-tv-blue">
            <Waves className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Macro PIT & Valuation Inputs</h2>
            <p className="text-sm text-tv-muted mt-1">
              Audit risk-free SBN 10Y, Indonesia ERP, BI-Rate, inflation target, tanggal observasi, dan provenance tanpa mengubah model diam-diam.
            </p>
          </div>
        </Link>

        <Link
          href="/admin/bank-fundamentals"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-blue/10 p-2 text-tv-blue">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Bank Fundamentals Evidence</h2>
            <p className="text-sm text-tv-muted mt-1">
              Audit NIM, NPL, CASA, CAR, LDR, credit cost dan PPOP per metrik dengan source/basis PIT. Tetap DATA_ONLY sampai model bank tervalidasi.
            </p>
          </div>
        </Link>

        <Link
          href="/admin/ownership-flow"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-blue/10 p-2 text-tv-blue">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Ownership Flow</h2>
            <p className="text-sm text-tv-muted mt-1">
              Status ingestion kepemilikan lokal/asing: tanggal observasi, cakupan universe, kegagalan, dan status audit sumber.
            </p>
          </div>
        </Link>

        {/* BROKER SUMMARY - NONAKTIF, SENGAJA DIPERTAHANKAN.
            Ingestion-nya menuntut upload berkas manual per emiten, yang tidak
            scalable untuk ratusan ticker; timer systemd-nya sudah dinonaktifkan
            2026-08-14 (lihat config/scheduled-jobs.json). Kode, skema, dan seluruh
            data historisnya TIDAK dihapus - fitur ini menunggu sumber broker
            summary yang legal, stabil, dan dapat diotomasi.
            Ownership Flow BUKAN penggantinya: keduanya mengukur besaran berbeda
            (transaksi per broker vs komposisi kepemilikan) - lihat
            docs/ownership-flow/broker-vs-ownership.md. */}
        <Link
          href="/admin/ownership-flow-validation"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-green/10 p-2 text-tv-green">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Ownership Flow Validation Lab</h2>
            <p className="text-sm text-tv-muted mt-1">
              Audit distribusi delta foreign/local dan gate point-in-time sebelum label akumulasi/distribusi boleh divalidasi.
            </p>
          </div>
        </Link>

        {/* 2026-08-18: kartu ini dulu menunjuk /admin/broker-summary (monitor broker
            PER EMITEN) dan berlabel "Aktif (EOD)". Labelnya menyesatkan - ingestion
            per-emiten itu menuntut upload berkas manual dan sudah dinonaktifkan
            2026-08-14 (lihat modules/broker-flow/index.ts), sehingga panelnya selalu
            kosong. Kartu sekarang menunjuk panel Broker EOD BEI yang benar-benar terisi
            dari API resmi Bursa. Rute lama TIDAK dihapus - modul, skema, dan datanya
            sengaja dipertahankan, hanya tidak lagi dipajang sebagai menu utama. */}
        <Link
          href="/admin/broker-eod"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-purple/10 p-2 text-tv-purple">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">
              Broker EOD BEI <span className="ml-1 rounded border border-tv-green/30 bg-tv-green/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tv-green align-middle">Resmi</span>
            </h2>
            <p className="text-sm text-tv-muted mt-1">
              Ringkasan harian seluruh Anggota Bursa dari API resmi BEI: nilai transaksi, volume, dan frekuensi per kode broker.
            </p>
          </div>
        </Link>

        {/* Cakupan Arus Asing dipajang terpisah dari Broker EOD BEI karena datanya beda
            sumbu: Broker EOD adalah agregat per KODE BROKER untuk seluruh pasar, sedangkan
            ini per EMITEN. Digabung, keduanya terbaca seolah satu tabel yang sama. Kartu ini
            juga satu-satunya tempat ketiadaan artefak terlihat - emiten tanpa artefak tetap
            tampil normal di UI dengan proxy CMF Yahoo, jadi tidak ada gejala di layar
            pengguna. */}
        <Link
          href="/admin/foreign-flow"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-blue/10 p-2 text-tv-blue">
            <Waves className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">
              Cakupan Arus Asing <span className="ml-1 rounded border border-tv-green/30 bg-tv-green/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tv-green align-middle">Resmi</span>
            </h2>
            <p className="text-sm text-tv-muted mt-1">
              Emiten mana yang sudah punya Net Foreign Buy/Sell resmi BEI, mana yang masih memakai proxy, dan sesegar apa artefaknya.
            </p>
          </div>
        </Link>

        {/* TP/CL Validation Lab berdiri sendiri di sini. Rutenya
            (/admin/tpcl-validation) memang sudah terpisah sejak awal, tapi satu-satunya
            tautan menujunya terkubur DI DALAM halaman Calibration Lab - jadi ia terbaca
            seolah bagian dari kalibrasi LensScore, padahal yang diuji mesin TP/CL
            (structure + ATR + fraksi harga IDX), kuantitas yang sama sekali berbeda. */}
        <Link
          href="/admin/tpcl-validation"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-yellow/10 p-2 text-tv-yellow">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">TP/CL Validation Lab</h2>
            <p className="text-sm text-tv-muted mt-1">
              Uji historis engine TP/CL yang sama dengan production: structure + ATR + fraksi harga IDX.
            </p>
          </div>
        </Link>
        <Link
          href="/admin/lensai-feedback"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-purple/10 p-2 text-tv-purple">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Feedback LensAI</h2>
            <p className="text-sm text-tv-muted mt-1">
              Tinjau jawaban yang ditandai membantu atau tidak tepat untuk menentukan perbaikan knowledge dan routing berikutnya.
            </p>
          </div>
        </Link>

        {/* Intraday Validation Lab BERDIRI SENDIRI, sengaja TIDAK jadi submenu
            Calibration Lab: yang diuji di sana edge T+20 LensScore, di sini model
            LensIntraday yang posisinya dibuka dan ditutup pada hari bursa yang sama.
            Menjadikannya submenu kalibrasi akan membuat orang membaca hasil T+20
            sebagai bukti intraday - persis kekeliruan yang modul ini dibangun untuk cegah. */}
        <Link
          href="/admin/intraday-validation"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-accent/10 p-2 text-tv-accent">
            <Timer className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Intraday Validation Lab</h2>
            <p className="text-sm text-tv-muted mt-1">
              Riset model LensIntraday (buka-tutup hari bursa yang sama): horizon 15/30/60 menit dan EOD,
              net return setelah biaya, dan protokol forward out-of-sample terpisah dari T+20.
            </p>
          </div>
        </Link>
        <Link
          href="/admin/jobs"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-green/10 p-2 text-tv-green">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Kesehatan Operasional</h2>
            <p className="text-sm text-tv-muted mt-1">
              Pantau cron, update data mingguan, koneksi cache/database, error provider, dan hasil audit terakhir.
            </p>
          </div>
        </Link>
        </div>

        <Card as="div" padding="none" radius="lg" elevation="none" overflow="hidden" highlight={false} className="border-tv-border mb-8">
          <div className="px-6 py-4 border-b border-tv-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tv-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tv-green"></span>
              </span>
              <h2 className="font-heading text-lg font-bold text-tv-text">Aktivitas Pengguna</h2>
              <span className="text-xs text-tv-muted">
                {activeUsersPanel.ok
                  ? `(${activeUsers.length} user aktif sekarang · presence 5 menit${rekapPeran ? ` — ${rekapPeran}` : ''})`
                  : '(presence tidak terbaca)'}
              </span>
            </div>
            {/* Titik hijau berdenyut menyiratkan data ini hidup, padahal ia snapshot
                saat halaman dirender dan tidak pernah menyegarkan dirinya. Waktu
                snapshot dinyatakan, dan disediakan cara memuat ulang.
                <a> biasa, bukan <Link>: navigasi klien ke rute yang sama tidak
                memicu pengambilan ulang di server. */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-tv-muted">Snapshot {jamWib(snapshotAt)}</span>
              <a
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-md border border-tv-border bg-tv-bg px-2.5 py-1.5 text-xs font-semibold text-tv-muted transition-colors hover:text-tv-text"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Segarkan
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px border-b border-tv-border bg-tv-border sm:grid-cols-4">
            {[
              ['Aktif 24 jam', activityReport.summary.active24h],
              ['Aktif 7 hari', activityReport.summary.active7d],
              ['Aktif 30 hari', activityReport.summary.active30d],
              ['Tidak aktif ≥30 hari', activityReport.summary.inactive30d],
            ].map(([label, count]) => (
              <div key={String(label)} className="bg-tv-card px-4 py-3">
                <div className="font-number text-xl font-bold text-tv-text">{count}</div>
                <div className="mt-0.5 text-[11px] text-tv-muted">{label}</div>
              </div>
            ))}
          </div>
          <p className="border-b border-tv-border px-6 py-2 text-[11px] leading-relaxed text-tv-muted">
            Aktivitas tersimpan dari request akun yang terautentikasi (maksimal satu pembaruan per 15 menit). Riwayat mulai tercatat setelah pembaruan ini; login terakhir dicatat saat login atau verifikasi berhasil.
          </p>
          {activeUsers.length === 0 ? (
            <EmptyState
              illustration="search"
              title="Tidak ada user aktif saat ini"
              description="Presence disimpan di Redis dengan TTL 5 menit. Daftar kosong juga muncul kalau Redis belum dikonfigurasi atau sedang tidak bisa dihubungi - itu degradasi yang disengaja, bukan error."
            />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-tv-bg text-tv-muted">
                <tr>
                  <th className="px-6 py-3 whitespace-nowrap">Email</th>
                  <th className="px-6 py-3 whitespace-nowrap">Role</th>
                  <th className="px-6 py-3 whitespace-nowrap">Durasi Buka Aplikasi</th>
                  <th className="px-6 py-3 whitespace-nowrap">Sesi Mulai</th>
                  <th className="px-6 py-3 whitespace-nowrap">Terakhir Terlihat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border">
                {activeUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-tv-hover">
                    <td className="px-6 py-3 text-tv-text whitespace-nowrap">{u.email}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        u.role === 'admin' ? 'bg-tv-red/20 text-tv-red' :
                        u.role === 'pro' ? 'bg-tv-green/20 text-tv-green' :
                        'bg-tv-hover text-tv-muted'
                      }`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap font-number">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-tv-green/10 border border-tv-green/20 px-2.5 py-0.5 text-xs font-bold text-tv-green">
                        <span className="h-1.5 w-1.5 rounded-full bg-tv-green animate-pulse" />
                        {formatDurasi(u.durationSec)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-tv-muted font-number whitespace-nowrap">
                      {jamWib(u.startedAt || u.lastSeen)}
                    </td>
                    <td className="px-6 py-3 text-tv-muted font-number whitespace-nowrap">
                      {jamWib(u.lastSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          <div className="border-t border-tv-border">
            <div className="px-6 py-4">
              <h3 className="font-heading text-base font-bold text-tv-text">Pengguna tidak aktif ≥30 hari</h3>
              <p className="mt-1 text-xs text-tv-muted">Termasuk akun yang belum mempunyai aktivitas tercatat sejak fitur ini aktif.</p>
            </div>
            {!activeUsersPanel.ok && (
              <p className="border-t border-tv-border px-6 py-4 text-sm text-tv-yellow">{activeUsersPanel.message}</p>
            )}
            {!activityPanel.ok ? (
              <p className="border-t border-tv-border px-6 py-5 text-sm text-tv-yellow">{activityPanel.message}</p>
            ) : activityReport.inactiveUsers.length === 0 ? (
              <p className="border-t border-tv-border px-6 py-5 text-sm text-tv-muted">Tidak ada pengguna tidak aktif dalam daftar saat ini.</p>
            ) : (
              <div className="overflow-x-auto border-t border-tv-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-tv-bg text-tv-muted">
                    <tr>
                      <th className="px-6 py-3 whitespace-nowrap">Email</th>
                      <th className="px-6 py-3 whitespace-nowrap">Role</th>
                      <th className="px-6 py-3 whitespace-nowrap">Login terakhir</th>
                      <th className="px-6 py-3 whitespace-nowrap">Aktivitas terakhir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tv-border">
                    {activityReport.inactiveUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-tv-hover">
                        <td className="px-6 py-3 whitespace-nowrap text-tv-text">{user.email}</td>
                        <td className="px-6 py-3 text-tv-muted">{user.role.toUpperCase()}</td>
                        <td className="px-6 py-3 whitespace-nowrap font-number text-tv-muted">{waktuWib(user.last_login_at)}</td>
                        <td className="px-6 py-3 whitespace-nowrap font-number text-tv-muted">{waktuWib(user.last_active_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        <Card as="div" padding="none" radius="lg" elevation="none" overflow="hidden" highlight={false} className="border-tv-border mb-8">
          {funnelPanel.ok ? (
            <>
          <div className="border-b border-tv-border px-6 py-4">
            <h2 className="font-heading text-lg font-bold text-tv-text">Funnel pendaftaran</h2>
            <p className="mt-1 text-xs leading-relaxed text-tv-muted">
              {funnelPanel.value.periodDays} hari terakhir. Angka memakai browser unik anonim; bukan IP, email, atau pelacakan lintas perangkat.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-px border-b border-tv-border bg-tv-border sm:grid-cols-3">
            {[
              ['Melihat kartu terkunci', funnelPanel.value.lockedViewVisitors, null],
              ['Klik daftar', funnelPanel.value.signupClickVisitors, funnelPanel.value.clickRatePct],
              ['Akun berhasil dibuat', funnelPanel.value.signupCompletedVisitors, funnelPanel.value.completionRatePct],
            ].map(([label, count, rate]) => (
              <div key={String(label)} className="bg-tv-card px-5 py-4">
                <div className="font-number text-2xl font-bold text-tv-text">{count}</div>
                <div className="mt-0.5 text-xs text-tv-muted">{label}</div>
                {typeof rate === 'number' && <div className="mt-1 text-[11px] font-semibold text-tv-blue">{rate.toFixed(1)}% dari tahap sebelumnya</div>}
              </div>
            ))}
          </div>
          {funnelPanel.value.topFeatures.length === 0 ? (
            <p className="px-6 py-5 text-sm text-tv-muted">Belum ada data funnel. Pencatatan dimulai setelah pembaruan ini aktif.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-tv-bg text-tv-muted">
                  <tr>
                    <th className="px-6 py-3 whitespace-nowrap">Fitur</th>
                    <th className="px-6 py-3 whitespace-nowrap">Lihat terkunci</th>
                    <th className="px-6 py-3 whitespace-nowrap">Klik daftar</th>
                    <th className="px-6 py-3 whitespace-nowrap">Akun dibuat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {funnelPanel.value.topFeatures.map((feature) => (
                    <tr key={feature.feature} className="hover:bg-tv-hover">
                      <td className="px-6 py-3 text-tv-text">{funnelFeatureLabel(feature.feature)}</td>
                      <td className="px-6 py-3 font-number text-tv-muted">{feature.lockedViews}</td>
                      <td className="px-6 py-3 font-number text-tv-muted">{feature.signupClicks}</td>
                      <td className="px-6 py-3 font-number text-tv-muted">{feature.signupsCompleted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
            </>
          ) : (
            <div className="px-6 py-5">
              <h2 className="font-heading text-lg font-bold text-tv-text">Funnel pendaftaran</h2>
              <p className="mt-1 text-sm text-tv-yellow">{funnelPanel.message}</p>
            </div>
          )}
        </Card>

        <Card as="div" padding="none" radius="lg" elevation="none" overflow="hidden" highlight={false} className="border-tv-border mb-8">
          {journeyPanel.ok ? (
            <>
          <div className="border-b border-tv-border px-6 py-4">
            <h2 className="font-heading text-lg font-bold text-tv-text">Perjalanan riset (beta)</h2>
            <p className="mt-1 text-xs leading-relaxed text-tv-muted">
              {journeyPanel.value.periodDays} hari terakhir, {journeyPanel.value.sessions} kunjungan. Syarat evaluasi beta Calm Intelligence - perilaku, bukan preferensi tampilan. Anonim per browser: tanpa akun, tanpa kode saham, tanpa IP.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-px border-b border-tv-border bg-tv-border sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: 'Waktu sampai analisis pertama',
                value: journeyPanel.value.medianSecondsToFirstAnalysis === null ? null : `${journeyPanel.value.medianSecondsToFirstAnalysis}s`,
                note: `median dari ${journeyPanel.value.analysisSessions} kunjungan yang sampai ke sana`,
              },
              {
                label: 'Pencarian yang berlanjut ke analisis',
                value: journeyPanel.value.searchToAnalysisPct === null ? null : `${journeyPanel.value.searchToAnalysisPct}%`,
                note: `dari ${journeyPanel.value.searchSessions} kunjungan yang mencari`,
              },
              {
                label: 'LensRadar yang berlanjut ke analisis',
                value: journeyPanel.value.radarToAnalysisPct === null ? null : `${journeyPanel.value.radarToAnalysisPct}%`,
                note: `dari ${journeyPanel.value.radarSessions} kunjungan yang membuka kandidat`,
              },
              {
                label: 'Ringkasan yang ditembus ke bukti',
                value: journeyPanel.value.summaryToEvidencePct === null ? null : `${journeyPanel.value.summaryToEvidencePct}%`,
                note: `dari ${journeyPanel.value.analysisSessions} kunjungan yang membuka analisis`,
              },
              {
                label: 'Pertanyaan LensAI berkonteks emiten',
                value: journeyPanel.value.lensaiWithContextPct === null ? null : `${journeyPanel.value.lensaiWithContextPct}%`,
                note: `dari ${journeyPanel.value.lensaiQuestions} pertanyaan`,
              },
              {
                label: 'Watchlist dibuka lebih dari satu hari',
                value: journeyPanel.value.repeatWatchlistPct === null ? null : `${journeyPanel.value.repeatWatchlistPct}%`,
                note: `dari ${journeyPanel.value.watchlistVisitors} browser yang membukanya`,
              },
            ].map((metric) => (
              <div key={metric.label} className="bg-tv-card px-5 py-4">
                {/* Nol persen dan "belum ada data" adalah dua temuan yang berbeda:
                    yang pertama berarti dicoba dan tidak ada yang lanjut. Keduanya
                    sengaja tidak ditampilkan sama. */}
                <div className="font-number text-2xl font-bold text-tv-text">{metric.value ?? '--'}</div>
                <div className="mt-0.5 text-xs text-tv-muted">{metric.label}</div>
                <div className="mt-1 text-[11px] text-tv-muted/70">{metric.value === null ? 'belum ada data' : metric.note}</div>
              </div>
            ))}
          </div>
          <p className="px-6 py-4 text-xs leading-relaxed text-tv-muted">
            Referensi dukungan yang sampai ke layar pengguna: <span className="font-number text-tv-text">{journeyPanel.value.supportReferencesShown}</span> kali.
            Data perjalanan dihapus setelah 90 hari (PRIVACY_JOURNEY_RETENTION_DAYS).
          </p>
            </>
          ) : (
            <div className="px-6 py-5">
              <h2 className="font-heading text-lg font-bold text-tv-text">Perjalanan riset (beta)</h2>
              <p className="mt-1 text-sm text-tv-yellow">{journeyPanel.message}</p>
            </div>
          )}
        </Card>

        <Card as="div" padding="none" radius="lg" elevation="none" overflow="hidden" highlight={false} className="border-tv-border mb-8">
          <div className="border-b border-tv-border px-6 py-4">
            <h2 className="font-heading text-lg font-bold text-tv-text">Jejak autentikasi terbaru</h2>
            <p className="mt-1 text-xs leading-relaxed text-tv-muted">
              Menampilkan maksimal 100 pendaftaran, verifikasi, dan login berhasil. IP mentah tidak disimpan: hanya prefiks jaringan dan ID hash untuk menghubungkan kejadian dari jaringan yang sama. Data dihapus setelah 90 hari.
            </p>
          </div>
          {!authEventsPanel.ok ? (
            <p className="px-6 py-5 text-sm text-tv-yellow">{authEventsPanel.message}</p>
          ) : recentAuthEvents.length === 0 ? (
            <p className="px-6 py-5 text-sm text-tv-muted">Belum ada jejak autentikasi. Pencatatan mulai aktif setelah pembaruan ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-tv-bg text-tv-muted">
                  <tr>
                    <th className="px-6 py-3 whitespace-nowrap">Waktu</th>
                    <th className="px-6 py-3 whitespace-nowrap">Aktivitas</th>
                    <th className="px-6 py-3 whitespace-nowrap">Email</th>
                    <th className="px-6 py-3 whitespace-nowrap">Jaringan</th>
                    <th className="px-6 py-3 whitespace-nowrap">ID jaringan</th>
                    <th className="px-6 py-3 whitespace-nowrap">Perangkat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {recentAuthEvents.map((event) => (
                    <tr key={event.id} className="hover:bg-tv-hover">
                      <td className="px-6 py-3 whitespace-nowrap font-number text-tv-muted">{waktuWib(event.created_at)}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-tv-text">{authEventLabel(event.event_type)}</td>
                      <td className="px-6 py-3 whitespace-nowrap text-tv-text">{event.email}</td>
                      <td className="px-6 py-3 whitespace-nowrap font-number text-tv-muted">{event.ip_prefix ?? 'Tidak tersedia'}</td>
                      <td className="px-6 py-3 whitespace-nowrap font-number text-tv-muted">{event.ip_hash ? event.ip_hash.slice(0, 12) : 'Tidak tersedia'}</td>
                      <td className="max-w-[260px] truncate px-6 py-3 text-tv-muted" title={event.user_agent ?? undefined}>{event.user_agent ?? 'Tidak tersedia'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
