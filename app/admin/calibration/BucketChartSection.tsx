'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui';
import { BucketTooltip, Val, num, pValue, pct } from './shared-ui';
import type { CalibrationDashboardData } from './types';

/** Bar chart Avg Return T+20 per bucket + kartu ringkas per bucket. */
export function BucketChartSection({ data }: { data: CalibrationDashboardData }) {
  return (
    <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="xl:col-span-3 border-tv-border p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading text-lg font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-tv-green" />
            Avg Return T+20 per Bucket
          </h2>
          <p className="text-xs text-tv-muted mt-1">
            Net return setelah fee 0,4% + slippage 0,1%. Bucket &lt;60 tidak ditampilkan di grafik
            utama supaya fokus ke kandidat rekomendasi.
          </p>
        </div>
      </div>

      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          {/* Warna grid/tooltip/cursor sebelumnya hex palet lama (#2A2E39,
              #131722, #1F2937) - lebih tua dari tv-*. */}
          <BarChart data={data.chart} margin={{ top: 16, right: 16, left: -12, bottom: 8 }}>
            <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" stroke="#1E293B" tick={{ fill: '#94A3B8', fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis stroke="#1E293B" tick={{ fill: '#94A3B8', fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
            {/* Garis nol: tanpa penanda ini, seluruh batang negatif tetap terlihat
                "tumbuh ke atas" karena sumbu Y menyesuaikan diri ke rentang data. */}
            <ReferenceLine y={0} stroke="#2B3A55" />
            <Tooltip cursor={{ fill: '#1B2440', opacity: 0.4 }} content={<BucketTooltip />} />
            {/* BUG FIX (2026-08-06): fill dulu dipatok "#22c55e" untuk SEMUA batang,
                jadi bucket dengan avg return NEGATIF digambar hijau - warnanya
                menyatakan kebalikan dari angkanya sendiri, di grafik yang justru
                dipakai memutuskan ambang skor. */}
            <Bar dataKey="avgReturnT20" name="Avg T+20" radius={[8, 8, 0, 0]}>
              {data.chart.map((row) => (
                <Cell
                  key={row.bucket}
                  fill={row.avgReturnT20 == null ? '#1E293B' : row.avgReturnT20 >= 0 ? '#22C55E' : '#EF4444'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* grid-cols-3 dipatok padahal jumlah bucket yang dikirim API tidak dijamin
          tiga - kolomnya sekarang mengikuti jumlah baris yang benar-benar ada. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
        {data.chart.map((row) => {
          const tipis = row.totalSamples > 0 && row.totalSamples < 30;
          return (
            <div key={row.bucket} className={`bg-tv-bg border border-tv-border rounded-lg p-3 ${row.totalSamples === 0 ? 'opacity-55' : ''}`}>
              <div className="text-xs text-tv-muted">Bucket {row.bucket}</div>
              <Val value={row.avgReturnT20} tone="signed" className="block font-bold mt-1" />
              <div className={`text-[11px] mt-1 ${tipis ? 'text-tv-warning' : 'text-tv-muted'}`}>
                {num(row.totalSamples)} sampel{tipis ? ' *' : ''}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-tv-muted">
        <span className="text-tv-warning">*</span> di bawah 30 sampel - rata-ratanya masih didominasi kebetulan.
      </p>
    </Card>
  );
}

/** T-test validasi edge bucket 80-100 vs <60. */
export function TTestSection({ data, baselineTotalSignals }: { data: CalibrationDashboardData; baselineTotalSignals: number | undefined }) {
  return (
    <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="xl:col-span-2 border-tv-border p-5">
      <h2 className="font-heading text-lg font-bold mb-1">T-test Validasi Edge</h2>
      <p className="text-xs text-tv-muted mb-4">
        Hipotesis: bucket 80-100 punya return T+20 lebih tinggi dari bucket &lt;60.
      </p>

      <div className={`rounded-lg border p-4 mb-4 ${
        data.tTest.significant
          ? 'border-tv-green/40 bg-tv-green/10 text-tv-green'
          : 'border-tv-yellow/40 bg-tv-yellow/10 text-tv-yellow'
      }`}>
        <div className="text-xs uppercase tracking-wide opacity-80">Kesimpulan</div>
        <div className="font-bold mt-1">{data.tTest.conclusion}</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-tv-border">
            <tr>
              <td className="py-2 text-tv-muted">Metode</td>
              <td className="py-2 text-right">{data.tTest.method}</td>
            </tr>
            <tr>
              <td className="py-2 text-tv-muted">Perbandingan</td>
              <td className="py-2 text-right font-mono">{data.tTest.comparison}</td>
            </tr>
            <tr>
              <td className="py-2 text-tv-muted">Avg T+20 80-100</td>
              <td className="py-2 text-right font-number">{pct(data.tTest.highAvgT20)}</td>
            </tr>
            <tr>
              <td className="py-2 text-tv-muted">Avg T+20 &lt;60</td>
              <td className="py-2 text-right font-number">{pct(data.tTest.lowAvgT20)}</td>
            </tr>
            <tr>
              <td className="py-2 text-tv-muted">Sampel 80-100 / &lt;60</td>
              <td className="py-2 text-right font-number">
                {num(data.tTest.highBucketSamples)} / {num(data.tTest.lowBucketSamples)}
                <div className="text-[10px] text-tv-muted mt-1">effective non-overlap; raw threshold-80 = {num(baselineTotalSignals)}</div>
              </td>
            </tr>
            <tr>
              <td className="py-2 text-tv-muted">t-stat / df</td>
              <td className="py-2 text-right font-number">
                {data.tTest.tStatistic == null && data.tTest.degreesOfFreedom == null
                  ? <span className="text-tv-muted/60 italic">belum bisa dihitung</span>
                  : `${data.tTest.tStatistic ?? '?'} / ${data.tTest.degreesOfFreedom ?? '?'}`}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-tv-muted">p-value</td>
              <td className={`py-2 text-right font-number font-bold ${data.tTest.significant ? 'text-tv-green' : 'text-tv-yellow'}`}>
                {pValue(data.tTest.pValue)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
