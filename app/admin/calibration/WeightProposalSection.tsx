'use client';

import { Card } from '@/components/ui';
import { PROPOSAL_STATUS_LABEL, Val, num, pValue, pct, weightText } from './shared-ui';
import type { CalibrationDashboardData } from './types';

/** Proposal bobot LensScore: hanya tampilan/review, tidak menerapkan perubahan. */
export function WeightProposalSection({ data }: { data: CalibrationDashboardData }) {
  return (
      <Card as="section" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-heading text-lg font-bold">Rekomendasi Bobot Baru</h2>
            <p className="text-xs text-tv-muted mt-1">
              Dibuat otomatis tiap Minggu 18:00 WIB. Proposal hanya untuk review admin,
              tidak mengubah bobot production.
            </p>
          </div>
          {data.latestWeightProposal && (
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              data.latestWeightProposal.status === 'PENDING_APPROVAL'
                ? 'bg-tv-green/10 text-tv-green border border-tv-green/30'
                : 'bg-tv-yellow/10 text-tv-yellow border border-tv-yellow/30'
            }`}>
              {PROPOSAL_STATUS_LABEL[data.latestWeightProposal.status] ?? data.latestWeightProposal.status.replaceAll('_', ' ')}
            </span>
          )}
        </div>

        {!data.latestWeightProposal ? (
          <div className="rounded-lg border border-tv-border bg-tv-bg p-4 text-sm text-tv-muted">
            Belum ada proposal bobot. Proposal pertama akan dibuat oleh cron `lens-score-optimizer`
            setelah data validasi dan histori komponen tersedia.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-tv-border bg-tv-bg p-4">
              <div className="text-xs text-tv-muted uppercase mb-1">Catatan Optimizer</div>
              <p className="text-sm text-tv-text leading-relaxed">{data.latestWeightProposal.reason}</p>
              <p className="text-xs text-tv-muted mt-2">
                Run {data.latestWeightProposal.runDate} • Window {data.latestWeightProposal.statsWindowStart || 'belum ada'} s/d {data.latestWeightProposal.statsWindowEnd || 'belum ada'} •
                Sampel komponen {num(data.latestWeightProposal.componentSampleSize)} • Kandidat {num(data.latestWeightProposal.candidateCount)}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-tv-border bg-tv-bg p-4">
                <div className="text-xs text-tv-muted uppercase mb-2">Bobot Saat Ini</div>
                <div className="font-bold text-tv-text">{weightText(data.latestWeightProposal.baselineWeights)}</div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                  <div>
                    <div className="text-tv-muted">Spread T+20</div>
                    <div className="font-number font-bold">{pct(data.latestWeightProposal.baselineSpreadT20)}</div>
                  </div>
                  <div>
                    <div className="text-tv-muted">p-value</div>
                    <div className="font-number font-bold">{pValue(data.latestWeightProposal.baselinePValue)}</div>
                  </div>
                  <div>
                    <div className="text-tv-muted">Sampel</div>
                    <div className="font-number font-bold">{num(data.latestWeightProposal.baselineSampleSize)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-tv-border bg-tv-bg p-4">
                <div className="text-xs text-tv-muted uppercase mb-2">Proposal Optimizer</div>
                <div className="font-bold text-tv-text">{weightText(data.latestWeightProposal.proposedWeights)}</div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                  <div>
                    <div className="text-tv-muted">Spread T+20</div>
                    {/* Dulu dipatok text-tv-green: spread usulan yang lebih BURUK dari
                        baseline tetap tampil hijau, seolah proposalnya selalu menang. */}
                    <Val value={data.latestWeightProposal.proposedSpreadT20} tone="signed" className="block font-bold" />
                  </div>
                  <div>
                    <div className="text-tv-muted">p-value</div>
                    <div className="font-number font-bold">{pValue(data.latestWeightProposal.proposedPValue)}</div>
                  </div>
                  <div>
                    <div className="text-tv-muted">Sampel</div>
                    <div className="font-number font-bold">{num(data.latestWeightProposal.proposedSampleSize)}</div>
                  </div>
                </div>
              </div>
            </div>

            {data.latestWeightProposal.status === 'PENDING_APPROVAL' && (
              <div className="rounded-lg border border-tv-blue/25 bg-tv-blue/[0.06] p-4">
                <div className="text-sm font-bold text-tv-text">Cara menerapkan proposal ini</div>
                <p className="mt-1 text-xs leading-relaxed text-tv-muted">
                  Tidak ada tombol Approve di halaman ini, dan itu disengaja. Mengubah bobot menggeser
                  skor seluruh saham untuk semua pengguna sekaligus; lewat kode, perubahan itu punya
                  jejak git, bisa direview, dan bisa dibatalkan kalau hasilnya memburuk.
                </p>
                <ol className="mt-3 space-y-1.5 text-xs leading-relaxed text-tv-text">
                  <li>
                    1. Buka <code className="font-mono text-tv-blue">shared/constants/lens-score-weights.ts</code>
                  </li>
                  <li>
                    2. Ubah <code className="font-mono text-tv-blue">LENS_SCORE_WEIGHTS</code> menjadi{' '}
                    <span className="font-bold">{weightText(data.latestWeightProposal.proposedWeights)}</span>
                  </li>
                  <li>3. Jalankan <code className="font-mono text-tv-blue">npm test</code> — bobot wajib berjumlah 100 dan ada test yang menjaganya</li>
                  <li>4. Commit dengan alasan + angka p-value/spread di atas, lalu deploy</li>
                  <li>5. Muat ulang halaman ini: kolom &quot;Bobot Saat Ini&quot; harus berubah mengikuti angka baru</li>
                </ol>
                <p className="mt-3 text-xs leading-relaxed text-tv-muted">
                  Belum yakin? Biarkan saja. Proposal ini tidak kedaluwarsa dan tidak mengubah apa pun
                  selama belum di-deploy — optimizer akan mengusulkan ulang setiap Minggu.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
  );
}
