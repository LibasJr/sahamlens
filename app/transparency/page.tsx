import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import TransparencyClient from './TransparencyClient';
import { Card } from '@/components/ui/Card';

// This page reads production-only reconciliation data. Keep it out of static
// prerendering so CI/build does not require DATABASE_URL. The repository is
// imported lazily at request time for the same reason.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function loadReconciliationSummary(): Promise<Array<Record<string, unknown>>> {
  try {
    const { getReconciliationSummary } = await import(
      '@/modules/market-data-integrity/repository/market-data-reconciliation.repository'
    );
    return await getReconciliationSummary(1);
  } catch (error) {
    console.error('[transparency] reconciliation summary unavailable', error);
    return [];
  }
}

export default async function TransparencyPage() {
  const reconciliationRuns = await loadReconciliationSummary();
  const latestRecon = reconciliationRuns[0];
  const compared = Number(latestRecon?.compared_count ?? 0);
  const matched = Number(latestRecon?.match_count ?? 0);
  const mismatched = Number(latestRecon?.mismatch_count ?? 0);
  const universe = Number(latestRecon?.universe_count ?? 0);
  const gaps = Number(latestRecon?.primary_only_count ?? 0) + Number(latestRecon?.secondary_only_count ?? 0) + Number(latestRecon?.no_data_count ?? 0);
  const coveragePct = universe > 0 ? (compared / universe) * 100 : null;
  const matchPct = compared > 0 ? (matched / compared) * 100 : null;
  return (
    <div className="min-h-screen bg-tv-bg text-tv-text p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/"
          className="mb-4 inline-flex min-h-6 items-center gap-1.5 text-sm text-tv-muted transition-colors hover:text-tv-text"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>

        <div className="mb-8">
          <p className="text-xs text-tv-accent font-semibold uppercase tracking-[0.2em] mb-2">
            Public Model Transparency
          </p>
          <h1 className="lens-page-title">
            Transparansi Validasi LensRadar
          </h1>
          <p className="text-sm text-tv-muted mt-2 max-w-3xl">
            Halaman ini menampilkan performa historis LensScore secara point-in-time, agar
            pengguna bisa melihat apakah bucket skor tinggi benar-benar punya edge setelah biaya.
          </p>
        </div>

        <section className="mb-6 rounded-xl border border-tv-blue/30 bg-tv-blue/5 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-tv-text">Apa arti “belum tervalidasi”?</h2>
          <p className="mt-2 text-sm leading-relaxed text-tv-muted">
            Kami belum punya cukup bukti forward bahwa LensScore dapat memprediksi pergerakan harga secara konsisten.
            Bukti tersebut sedang dikumpulkan secara terbuka dan diuji dengan data yang benar-benar tersedia setelah model dibekukan.
            Sampai jumlah dan durasinya cukup, perlakukan skor sebagai <span className="font-semibold text-tv-text">bahan riset dan pembanding</span>, bukan sinyal beli atau jaminan hasil.
          </p>
        </section>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-border p-4 sm:p-5">
          <h2 className="text-base font-semibold text-tv-text">Komitmen Integritas Data</h2>
          <div className="mt-3 grid gap-3 text-sm text-tv-muted md:grid-cols-2">
            <p><span className="font-semibold text-tv-text">Fail-closed.</span> Data yang tidak tersedia ditampilkan sebagai N/A/null, bukan diganti angka netral atau estimasi tanpa sumber.</p>
            <p><span className="font-semibold text-tv-text">Point-in-time.</span> Backfill yang baru diketahui setelah tanggal historis tidak diperlakukan sebagai sinyal yang tersedia pada masa lalu.</p>
            <p><span className="font-semibold text-tv-text">Research-only sampai tervalidasi.</span> Status model tidak dinaikkan hanya karena backtest terlihat baik; forward OOS dan gate sampel tetap wajib.</p>
            <p><span className="font-semibold text-tv-text">Reproducible.</span> Perubahan scoring, asumsi makro, parameter riset, dan schema dipisahkan lewat versi/migration agar hasil lama dapat diaudit.</p>
          </div>
          <p className="mt-3 text-xs text-tv-muted">SahamLens adalah alat riset dan analisis, bukan jaminan hasil investasi. Detail risiko dan batas penggunaan tersedia di halaman Disclaimer.</p>
        </Card>

        <Card as="section" padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="mb-6 border-tv-border p-4 sm:p-5">
          <h2 className="text-base font-semibold text-tv-text">Verifikasi Harga Penutupan Lintas Sumber</h2>
          {latestRecon && matchPct != null ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <div><p className="text-xs text-tv-muted">Tanggal pembanding</p><p className="font-number text-lg font-bold">{String(latestRecon.trade_date ?? '-')}</p></div>
              <div><p className="text-xs text-tv-muted">Cocok persis</p><p className="font-number text-lg font-bold text-tv-green">{matchPct.toFixed(2)}%</p></div>
              <div><p className="text-xs text-tv-muted">Coverage dibandingkan</p><p className="font-number text-lg font-bold">{coveragePct == null ? '-' : `${coveragePct.toFixed(2)}%`}</p></div><div><p className="text-xs text-tv-muted">Mismatch / gap</p><p className="font-number text-lg font-bold text-amber-300">{mismatched} / {gaps}</p></div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-tv-muted">Rekonsiliasi lintas sumber belum memiliki hasil produksi. SahamLens tidak mengklaim tingkat kecocokan sebelum bukti tersedia.</p>
          )}
          <p className="mt-3 text-xs text-tv-muted">Aturan v1 membandingkan close pada tanggal perdagangan yang sama dan menuntut kecocokan persis. Mismatch tidak dikoreksi otomatis.</p>
        </Card>

        <TransparencyClient />
      </div>
    </div>
  );
}
