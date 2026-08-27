'use client';

import {
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Lock } from 'lucide-react';
import { Card } from '@/components/ui';
import { num, prob, score4 } from './shared-ui';
import type { CalibrationDashboardData } from './types';

/** Kalibrasi Skor: reliability diagram, bin table, ECE/Brier, isotonic regression. */
export function ScoreCalibrationSection({
  data,
  reliabilityPoints,
}: {
  data: CalibrationDashboardData;
  reliabilityPoints: Array<CalibrationDashboardData['scoreCalibration']['bins'][number] & { ciOffset: [number, number] }>;
}) {
  return (
    <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading text-lg font-bold">Kalibrasi Skor</h2>
          <p className="text-xs text-tv-muted mt-1">
            Discrimination menjawab &quot;apakah skor 85 lebih baik daripada 55&quot;. Kalibrasi menjawab
            pertanyaan lain: kalau skor 85 dibaca sebagai 85% peluang menang, apakah 85% dari
            sinyal skor 85 benar-benar menang? Model bisa benar pada yang pertama dan kacau pada
            yang kedua secara bersamaan.
          </p>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold self-start ${data.scoreCalibration.status === 'REPORTED' ? 'bg-tv-blue/15 text-tv-blue' : 'bg-tv-yellow/15 text-tv-yellow'}`}>
          {data.scoreCalibration.status}
        </div>
      </div>

      <div className="rounded-lg border border-tv-border bg-tv-bg/60 p-4 mb-4 text-xs">
        <div className="text-tv-muted uppercase">Definisi outcome (ditetapkan sebelum melihat data)</div>
        <div className="font-number mt-1 text-tv-text">{data.scoreCalibration.outcomeRule}</div>
        <div className="text-tv-muted mt-2">
          Protokol {data.scoreCalibration.protocolVersion} • {num(data.scoreCalibration.samples)} sampel efektif •
          lebar bin {data.scoreCalibration.binWidth} poin • {data.scoreCalibration.reliableBins} bin mencapai{' '}
          {data.scoreCalibration.minSamplesPerReliableBin} sampel
        </div>
      </div>

      {/* Pemetaan p = skor/100 BUKAN klaim produk - tidak ada satu tempat pun yang
          menerjemahkan LensScore 76 jadi "76% peluang untung". Ia dipakai sebagai garis
          acuan supaya pertanyaan "berapa jauh skor dari satuan probabilitas" punya jawaban
          berangka. Tanpa catatan ini, ECE besar mudah disalahbaca sebagai bug. */}
      <div className="rounded-lg border border-tv-border bg-tv-bg p-3 mb-4 text-[11px] text-tv-muted leading-relaxed">
        Pemetaan naif <span className="font-number text-tv-text">p = skor/100</span> di bawah adalah
        TITIK ACUAN, bukan klaim yang sedang dibela. SahamLens tidak pernah menyebut LensScore
        sebagai persen peluang. ECE yang besar terhadap acuan ini adalah hasil yang diharapkan -
        dan justru itu alasan angka skor tidak boleh dibaca sebagai persen.
      </div>

      {data.scoreCalibration.bins.length > 0 ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <div className="text-sm font-semibold mb-1">Reliability diagram</div>
              <div className="text-[11px] text-tv-muted mb-3">
                Sumbu-x prediksi, sumbu-y frekuensi menang yang teramati, batang vertikal = CI 95%
                Wilson. Titik yang duduk di garis putus-putus berarti terkalibrasi.
              </div>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      type="number" dataKey="predicted" domain={[0, 1]} tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                      label={{ value: 'Prediksi (skor/100)', position: 'insideBottom', offset: -12, fontSize: 11 }}
                    />
                    <YAxis
                      type="number" dataKey="observed" domain={[0, 1]} tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                    />
                    <ZAxis type="number" dataKey="samples" range={[40, 400]} />
                    {/* Garis kalibrasi sempurna. */}
                    <ReferenceLine
                      segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]}
                      stroke="#9CA3AF" strokeDasharray="4 4" ifOverflow="extendDomain"
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      contentStyle={{ background: '#12161F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                      formatter={(value) => prob(typeof value === 'number' ? value : null)}
                    />
                    <Scatter data={reliabilityPoints} fill="#4F8CFF">
                      <ErrorBar dataKey="ciOffset" width={4} strokeWidth={1.5} stroke="#4F8CFF" direction="y" />
                      {data.scoreCalibration.bins.map((bin) => (
                        <Cell key={bin.binLow} fill={bin.reliable ? (bin.predictionWithinCi ? '#23C483' : '#FF5D6C') : '#5B6472'} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-4 text-[11px] text-tv-muted mt-1">
                <span><span className="inline-block w-2 h-2 rounded-full bg-tv-green mr-1" />terkalibrasi</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-tv-red mr-1" />meleset dari CI</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-[#5B6472] mr-1" />sampel belum cukup</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-tv-muted border-b border-tv-border">
                    <th className="text-left py-2">Bin skor</th>
                    <th className="text-right py-2">N</th>
                    <th className="text-right py-2">Prediksi</th>
                    <th className="text-right py-2">Teramati</th>
                    <th className="text-right py-2">CI 95%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scoreCalibration.bins.map((bin) => (
                    <tr key={bin.binLow} className="border-b border-tv-border/60">
                      <td className="py-2 font-number">{bin.binLow}-{bin.binHigh}</td>
                      <td className={`py-2 text-right font-number ${bin.reliable ? '' : 'text-tv-muted'}`}>
                        {num(bin.samples)}{bin.reliable ? '' : ' *'}
                      </td>
                      <td className="py-2 text-right font-number">{prob(bin.predicted)}</td>
                      <td className="py-2 text-right font-number">{prob(bin.observed)}</td>
                      <td className={`py-2 text-right font-number ${bin.reliable && !bin.predictionWithinCi ? 'text-tv-red' : 'text-tv-muted'}`}>
                        {prob(bin.wilsonLow)}–{prob(bin.wilsonHigh)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[11px] text-tv-muted mt-2">
                * di bawah {data.scoreCalibration.minSamplesPerReliableBin} sampel - tetap ditampilkan,
                tidak ikut menolak atau membenarkan apa pun.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">ECE</div>
              <div className="font-number text-2xl font-bold mt-1">{score4(data.scoreCalibration.naive?.ece)}</div>
              <div className="text-[11px] text-tv-muted mt-1">rata-rata |teramati − prediksi|</div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">Brier</div>
              <div className="font-number text-2xl font-bold mt-1">{score4(data.scoreCalibration.naive?.brier)}</div>
              <div className="text-[11px] text-tv-muted mt-1">base rate: {score4(data.scoreCalibration.naive?.brierBaseRate)}</div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">Skill score</div>
              <div className={`font-number text-2xl font-bold mt-1 ${(data.scoreCalibration.naive?.brierSkillScore ?? 0) > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                {score4(data.scoreCalibration.naive?.brierSkillScore)}
              </div>
              <div className="text-[11px] text-tv-muted mt-1">negatif = kalah dari tebakan konstan</div>
            </div>
            <div className="bg-tv-bg border border-tv-border rounded-lg p-4">
              <div className="text-xs text-tv-muted uppercase">Base rate</div>
              <div className="font-number text-2xl font-bold mt-1">{prob(data.scoreCalibration.naive?.baseRate)}</div>
              <div className="text-[11px] text-tv-muted mt-1">frekuensi menang keseluruhan</div>
            </div>
          </div>

          {/* Bagian yang benar-benar informatif: apakah ADA pemetaan monoton dari skor ke
              probabilitas yang bertahan di luar sampel latihnya. Fit di seluruh data lalu
              dilaporkan sebagai bukti adalah cara tercepat menghasilkan kalibrasi sempurna
              yang tidak berarti apa-apa - karena itu split-nya temporal dan dinyatakan. */}
          <div className="mt-5 rounded-lg border border-tv-border bg-tv-bg/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div className="text-sm font-semibold">Isotonic regression — fit di TRAIN, diuji di TEST</div>
              <div className="text-[11px] text-tv-muted font-number">
                {data.scoreCalibration.isotonic.trainSamples} train / {data.scoreCalibration.isotonic.testSamples} test
                {data.scoreCalibration.isotonic.splitDate ? ` • split ${data.scoreCalibration.isotonic.splitDate}` : ''}
              </div>
            </div>

            {data.scoreCalibration.isotonic.fitted ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-tv-muted border-b border-tv-border">
                      <th className="text-left py-2">Pemetaan (dinilai di TEST yang sama)</th>
                      <th className="text-right py-2">Brier</th>
                      <th className="text-right py-2">ECE</th>
                      <th className="text-right py-2">Skill score</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-tv-border/60">
                      <td className="py-2">Naif (skor/100)</td>
                      <td className="py-2 text-right font-number">{score4(data.scoreCalibration.isotonic.naiveOnTest?.brier)}</td>
                      <td className="py-2 text-right font-number">{score4(data.scoreCalibration.isotonic.naiveOnTest?.ece)}</td>
                      <td className="py-2 text-right font-number">{score4(data.scoreCalibration.isotonic.naiveOnTest?.brierSkillScore)}</td>
                    </tr>
                    <tr className="border-b border-tv-border/60">
                      <td className="py-2">Isotonic (hasil TRAIN)</td>
                      <td className={`py-2 text-right font-number ${data.scoreCalibration.isotonic.improvesBrierOutOfSample ? 'text-tv-green' : 'text-tv-red'}`}>
                        {score4(data.scoreCalibration.isotonic.isotonicOnTest?.brier)}
                      </td>
                      <td className="py-2 text-right font-number">{score4(data.scoreCalibration.isotonic.isotonicOnTest?.ece)}</td>
                      <td className={`py-2 text-right font-number ${(data.scoreCalibration.isotonic.isotonicOnTest?.brierSkillScore ?? 0) > 0 ? 'text-tv-green' : 'text-tv-red'}`}>
                        {score4(data.scoreCalibration.isotonic.isotonicOnTest?.brierSkillScore)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="text-[11px] text-tv-muted mt-2">
                  Kurva: {data.scoreCalibration.isotonic.curve.map((point) => `${point.score}→${prob(point.probability, 0)}`).join('  ')}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-tv-muted" />
                <p className="text-xs leading-relaxed text-tv-muted">{data.scoreCalibration.isotonic.note}</p>
              </div>
            )}

            {data.scoreCalibration.isotonic.fitted && (
              <p className="text-[11px] text-tv-muted mt-3 leading-relaxed">{data.scoreCalibration.isotonic.note}</p>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-tv-border bg-tv-bg p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-tv-muted" />
          <p className="text-xs leading-relaxed text-tv-muted">{data.scoreCalibration.conclusion}</p>
        </div>
      )}

      {data.scoreCalibration.bins.length > 0 && (
        <div className={`mt-4 rounded-lg border p-3 text-xs ${data.scoreCalibration.naiveMappingRejected ? 'border-tv-red/40 bg-tv-red/10 text-tv-red' : 'border-tv-border bg-tv-bg text-tv-muted'}`}>
          {data.scoreCalibration.conclusion}
        </div>
      )}
    </Card>
  );
}
