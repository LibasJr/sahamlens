import React from 'react';
import { EmptyState } from '@/components/ui';
import { fmtBacktestPct, type BucketBacktest, type HorizonKey } from '@/app/breakout-radar/radar-model';
import { useLanguage } from '@/lib/i18n';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Kartu pengganti tabel validasi selama histori belum cukup panjang.
 *
 * Sebelumnya kondisi ini cuma menghasilkan satu baris teks kuning, atau - kalau
 * `note` kebetulan null - tidak menghasilkan apa pun sehingga bagian validasi
 * hilang tanpa jejak. Angka 0 sampel bukan kegagalan: backtest ini memang perlu
 * lebih dari 90 hari kalender arsip harian sebelum bisa menghitung apa pun.
 * Yang perlu diberi tahu ke user adalah sudah sampai mana dan kapan siapnya.
 */
export function BucketBacktestPending({ data }: { data: BucketBacktest }) {
  const { language } = useLanguage();
  const isId = language === 'id';
  const required = data.minRequiredDays ?? 90;
  const collected = Math.max(0, data.coverageDays);

  // Tanggal siap dihitung dari hari pertama arsip, bukan dari hari ini - kalau
  // dihitung dari hari ini, targetnya mundur terus tiap kali halaman dibuka.
  const readyDate = data.minDate
    ? new Date(new Date(data.minDate).getTime() + (required + 1) * MS_PER_DAY)
    : null;

  return (
    <div className="border-t border-tv-border bg-tv-bg/30 px-4 py-2">
      <EmptyState
        illustration="collecting"
        title={isId ? 'Validasi bucket belum bisa dihitung' : 'Bucket validation cannot be computed yet'}
        description={isId
          ? `Tabel ini membandingkan hasil nyata tiap rentang LensScore. Perbandingannya baru bermakna setelah arsip harian melewati ${required} hari kalender - menampilkannya lebih awal berarti menyajikan kesimpulan dari sampel yang terlalu kecil.`
          : `This table compares forward results across LensScore buckets. Results become statistically meaningful once daily archives exceed ${required} calendar days — presenting them earlier risks conclusions from insufficient samples.`}
        progress={{
          current: collected,
          total: required,
          unit: isId ? 'hari' : 'days',
          label: isId ? 'Pengumpulan data' : 'Data collection',
        }}
        countdown={readyDate ? { targetDate: readyDate, label: isId ? 'Perkiraan tabel muncul' : 'Estimated table availability' } : undefined}
      />
      {data.minDate && (
        <p className="pb-3 text-center text-[10px] text-tv-muted">
          {isId
            ? `Arsip dimulai ${new Date(data.minDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}${data.tradingDays > 0 ? ` · ${data.tradingDays} hari bursa terekam` : ''}`
            : `Archive started ${new Date(data.minDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}${data.tradingDays > 0 ? ` · ${data.tradingDays} trading days recorded` : ''}`}
        </p>
      )}
    </div>
  );
}

export function BucketBacktestCard({ data }: { data: BucketBacktest }) {
  const { language } = useLanguage();
  const isId = language === 'id';
  const horizons: { key: HorizonKey; label: string }[] = [
    { key: 't1', label: 'T+1' },
    { key: 't5', label: 'T+5' },
    { key: 't20', label: 'T+20' },
  ];
  const primaryTest = data.tTests.t20;

  return (
    <div className="border-t border-tv-border bg-tv-bg/30 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-heading text-sm font-bold text-tv-text">{isId ? 'Validasi Bucket LensScore' : 'LensScore Bucket Validation'}</h3>
          <p className="text-[11px] text-tv-muted mt-1">
            {isId
              ? `Histori ${data.coverageDays} hari kalender (${data.tradingDays} hari bursa), ${data.minDate} sampai ${data.maxDate}. Return sudah dikurangi fee+slippage ${data.roundTripCostPct.toFixed(1)}% round-trip.`
              : `History spans ${data.coverageDays} calendar days (${data.tradingDays} trading days), ${data.minDate} to ${data.maxDate}. Returns net of ${data.roundTripCostPct.toFixed(1)}% round-trip fee+slippage.`}
          </p>
          <p className="text-[10px] text-tv-muted mt-1">{data.entryRule}</p>
        </div>
        <div className={`rounded-md border px-3 py-2 text-[11px] ${
          primaryTest.bucket80Better && primaryTest.significantAt5Pct
            ? 'border-tv-green/30 bg-tv-green/10 text-tv-green'
            : 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow'
        }`}>
          80-100 vs 60-69 T+20:{' '}
          {primaryTest.tStatistic == null
            ? (isId ? 'sampel belum cukup' : 'insufficient sample')
            : `${primaryTest.bucket80Better ? (isId ? 'lebih baik' : 'outperforming') : (isId ? 'belum lebih baik' : 'not outperforming')}; t=${primaryTest.tStatistic}, p≈${primaryTest.pValueApprox ?? 'N/A'}`}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-tv-border text-tv-muted uppercase font-semibold tracking-wide">
              <th className="py-2 pr-3">{isId ? 'Bucket' : 'Bucket'}</th>
              {horizons.map((h) => (
                <th key={h.key} className="py-2 px-3 text-right">{h.label} Avg</th>
              ))}
              {horizons.map((h) => (
                <th key={`${h.key}-win`} className="py-2 px-3 text-right">{h.label} Win</th>
              ))}
              {horizons.map((h) => (
                <th key={`${h.key}-n`} className="py-2 pl-3 text-right">{h.label} N</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-tv-border/70">
            {data.buckets.map((bucket) => (
              <tr key={bucket.bucket}>
                <td className="py-2 pr-3 font-bold text-tv-text">{bucket.bucket}</td>
                {horizons.map((h) => (
                  <td key={h.key} className="py-2 px-3 text-right font-number text-tv-text">
                    {fmtBacktestPct(bucket.horizons[h.key]?.avgReturnPct ?? null)}
                  </td>
                ))}
                {horizons.map((h) => {
                  const winRate = bucket.horizons[h.key]?.winRatePct ?? null;
                  // Heatmap win rate: titik netralnya 50%, bukan 0 - win rate 45% itu
                  // buruk, dan skala yang berpangkal di 0 akan mewarnainya sebagai
                  // "cukup baik". Intensitas dipotong di 20 poin dari netral.
                  const deviation = winRate == null ? 0 : (winRate - 50) / 20;
                  const magnitude = Math.min(Math.abs(deviation), 1);
                  const rgb = deviation >= 0 ? '34,197,94' : '239,68,68';
                  return (
                    <td
                      key={`${h.key}-win`}
                      className="py-2 px-3 text-right font-number text-tv-text"
                      style={winRate == null ? undefined : { backgroundColor: `rgba(${rgb},${0.06 + magnitude * 0.28})` }}
                    >
                      {winRate == null ? <span className="text-tv-muted">N/A</span> : `${winRate.toFixed(0)}%`}
                    </td>
                  );
                })}
                {horizons.map((h) => {
                  const samples = bucket.horizons[h.key]?.samples ?? 0;
                  // Sampel di bawah 30 ditandai: rata-rata dari sampel sekecil itu
                  // masih didominasi kebetulan, dan angkanya di kolom kiri terbaca
                  // sama meyakinkannya dengan yang bersampel besar.
                  const thin = samples > 0 && samples < 30;
                  return (
                    <td
                      key={`${h.key}-n`}
                      className={`py-2 pl-3 text-right font-number ${thin ? 'text-tv-warning' : 'text-tv-muted'}`}
                      title={thin ? (isId ? `${samples} sampel - terlalu sedikit untuk disimpulkan` : `${samples} samples — too few for reliable conclusions`) : undefined}
                    >
                      {samples}{thin ? '*' : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Storytelling: tabel di atas menyimpan temuan utamanya di dalam angka yang
          harus dibandingkan sendiri oleh pembaca. Kalimat ini menyebutkannya. */}
      {(() => {
        const high = data.buckets.find((b) => b.bucket.startsWith('80'));
        const low = data.buckets.find((b) => b.bucket.startsWith('60'));
        const hiWin = high?.horizons.t20?.winRatePct ?? null;
        const loWin = low?.horizons.t20?.winRatePct ?? null;
        if (hiWin == null || loWin == null) return null;
        const gap = hiWin - loWin;
        const significant = primaryTest.significantAt5Pct && primaryTest.bucket80Better;
        return (
          <div className={`mt-3 rounded-md border px-3 py-2.5 ${significant ? 'border-tv-green/25 bg-tv-green/5' : 'border-tv-border bg-tv-bg/40'}`}>
            <p className="text-[11px] leading-relaxed text-tv-text">
              {isId ? (
                <>
                  Bucket <span className="font-number font-semibold">{high!.bucket}</span> punya win rate T+20{' '}
                  <span className={`font-number font-semibold ${gap >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                    {gap >= 0 ? '+' : ''}{gap.toFixed(0)} poin persen
                  </span>{' '}
                  dibanding bucket <span className="font-number font-semibold">{low!.bucket}</span> ({hiWin.toFixed(0)}% vs {loWin.toFixed(0)}%).{' '}
                  {significant
                    ? 'Selisih ini lolos uji signifikansi 5%, jadi kecil kemungkinannya murni kebetulan - tapi tetap dari data masa lalu.'
                    : 'Selisih ini BELUM lolos uji signifikansi 5%, artinya masih bisa muncul dari kebetulan semata. Jangan dijadikan dasar keputusan.'}
                </>
              ) : (
                <>
                  Bucket <span className="font-number font-semibold">{high!.bucket}</span> shows a T+20 win rate{' '}
                  <span className={`font-number font-semibold ${gap >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                    {gap >= 0 ? '+' : ''}{gap.toFixed(0)} percentage points
                  </span>{' '}
                  vs bucket <span className="font-number font-semibold">{low!.bucket}</span> ({hiWin.toFixed(0)}% vs {loWin.toFixed(0)}%).{' '}
                  {significant
                    ? 'This difference satisfies 5% statistical significance, indicating low likelihood of random chance — though historical.'
                    : 'This difference has NOT yet met 5% significance; it may reflect chance variance. Do not rely on it as decisive.'}
                </>
              )}
            </p>
          </div>
        );
      })()}

      <p className="text-[10px] text-tv-muted mt-3">
        {isId
          ? 'T-test memakai Welch sederhana untuk membandingkan bucket 80-100 dengan 60-69. Ini bukti awal kalibrasi scanner, bukan jaminan performa masa depan. Tanda * pada kolom N menandai sampel di bawah 30 - terlalu sedikit untuk disimpulkan. "N/A" berarti belum ada sampel sama sekali di rentang itu, bukan hasil nol.'
          : 'T-test uses Welch’s test to compare bucket 80-100 against 60-69. This is scanner calibration evidence, not a guarantee of future returns. An asterisk (*) in column N marks samples under 30 — too small for definitive conclusions. "N/A" indicates zero samples in that range, not a zero return.'}
      </p>
    </div>
  );
}
