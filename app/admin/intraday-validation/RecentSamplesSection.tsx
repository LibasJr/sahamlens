'use client';

import { NA, SampleTag, Scroller, SortableSampleTh, Td, ValidationCard, int, num, pct, wib } from './shared-ui';
import type { RecentSample, SampleSort, SampleSortKey } from './types';

/** Tabel sortable contoh observasi H30 terbaru untuk pemeriksaan admin. */
export function RecentSamplesSection({
  totalSamples,
  sortedRecentSamples,
  sampleSort,
  onSort,
}: {
  totalSamples: number;
  sortedRecentSamples: RecentSample[];
  sampleSort: SampleSort;
  onSort: (key: SampleSortKey) => void;
}) {
  return (
    <ValidationCard
      title="Contoh observasi intraday terbaru"
      subtitle="Sampel H30 dari data riset tersimpan untuk pemeriksaan admin. Klik judul kolom untuk mengurutkan naik/turun; ini tidak mengubah data, formula, atau hasil validasi."
    >
      {totalSamples === 0 ? (
        <p className="text-sm text-tv-muted">Belum ada outcome H30 yang terisi untuk versi model dan konfigurasi aktif.</p>
      ) : (
        <Scroller>
          <table className="w-full text-xs">
            <thead className="text-tv-muted">
              <tr>
                <SortableSampleTh label="Waktu sinyal" sortKey="signalTimestamp" sort={sampleSort} onSort={onSort} />
                <SortableSampleTh label="Emiten" sortKey="ticker" sort={sampleSort} onSort={onSort} />
                <SortableSampleTh label="Skor" sortKey="score" sort={sampleSort} onSort={onSort} />
                <SortableSampleTh label="Entry" sortKey="entryPriceRaw" sort={sampleSort} onSort={onSort} />
                <SortableSampleTh label="Harga exit" sortKey="exitPriceRaw" sort={sampleSort} onSort={onSort} />
                <SortableSampleTh label="Net return" sortKey="netReturn" sort={sampleSort} onSort={onSort} />
                <SortableSampleTh label="Alasan exit" sortKey="exitReason" sort={sampleSort} onSort={onSort} />
                <SortableSampleTh label="Layak dieksekusi" sortKey="tradable" sort={sampleSort} onSort={onSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-tv-border">
              {sortedRecentSamples.map((sample) => (
                <tr key={`${sample.ticker}-${sample.signalTimestamp}-${sample.horizon}`}>
                  <Td>{wib(sample.signalTimestamp)}</Td>
                  <Td><span className="font-semibold text-tv-text">{sample.ticker.replace('.JK', '')}</span></Td>
                  <Td>{num(sample.score, 2)}</Td>
                  <Td>{int(sample.entryPriceRaw)}</Td>
                  <Td>{int(sample.exitPriceRaw)}</Td>
                  <Td><span className={sample.netReturn != null && sample.netReturn > 0 ? 'text-tv-green' : sample.netReturn != null && sample.netReturn < 0 ? 'text-tv-red' : 'text-tv-muted'}>{pct(sample.netReturn, 3)}</span></Td>
                  <Td>{sample.exitReason}</Td>
                  <Td>{sample.tradable === true ? <span className="text-tv-green">ya</span> : sample.tradable === false ? <span className="text-tv-yellow">tidak</span> : NA}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      )}
    </ValidationCard>
  );
}

// SampleTag re-export kept for symmetry with original file's imports; unused
// directly here but signals intent that section files own their own subset.
export { SampleTag };
