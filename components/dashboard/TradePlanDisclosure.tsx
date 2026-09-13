'use client';

import { Card } from '@/components/ui/Card';

/**
 * Menampilkan kualitas data di balik TradePlan v1.0.
 *
 * `buildTradePlanV1` sudah menghitung `missingData[]`, `confidenceScore`, dan `dataPoints[]`
 * sejak awal, dan API sudah mengirimkannya. Yang tidak pernah ada: satu pun pembaca di UI.
 * Terverifikasi 13 September 2026 - grep `missingData` di seluruh `components/**` dan
 * `app/**` mengembalikan nol hasil.
 *
 * Akibatnya pengguna melihat "TP 1.834" tanpa tahu angka itu diturunkan dari pivot
 * struktural 1.705, bukan dari harga penutupan, dan tanpa tahu masukan apa yang tidak
 * tersedia saat rencana itu disusun. Angka yang tampil persis sama rupanya baik ketika
 * seluruh masukan lengkap maupun ketika separuhnya hilang - itu yang membuat disclosure
 * ini bukan hiasan.
 *
 * Komponen ini TIDAK menghitung apa pun. Ia hanya menyatakan apa yang sudah diputuskan di
 * `trade-plan.ts`. Menghitung ulang kualitas data di lapisan tampilan berarti membuat dua
 * sumber kebenaran yang pasti menyimpang.
 */

export interface TradePlanDisclosureDataPoint {
  key: string;
  label: string;
  /** Dipakai apa adanya. Menyimpulkan ulang ketersediaan dari `value` di lapisan tampilan
   * berarti membuat sumber kebenaran kedua yang pasti menyimpang dari `trade-plan.ts`. */
  status: 'AVAILABLE' | 'NOT_AVAILABLE';
  source: string;
  value: string | number | null;
}

export interface TradePlanDisclosureProps {
  confidenceScore?: number | null;
  confidenceLevel?: string | null;
  entryReference?: string | null;
  missingData?: string[] | null;
  caveats?: string[] | null;
  dataPoints?: TradePlanDisclosureDataPoint[] | null;
}

const LEVEL_STYLE: Record<string, string> = {
  HIGH: 'border-tv-green/40 bg-tv-green/10 text-tv-green',
  MEDIUM: 'border-tv-yellow/40 bg-tv-yellow/10 text-tv-yellow',
  LOW: 'border-tv-red/40 bg-tv-red/10 text-tv-red',
};

export function TradePlanDisclosure({
  confidenceScore,
  confidenceLevel,
  entryReference,
  missingData,
  caveats,
  dataPoints,
}: TradePlanDisclosureProps) {
  const missing = Array.isArray(missingData) ? missingData.filter((m) => typeof m === 'string' && m.length > 0) : [];
  const notes = Array.isArray(caveats) ? caveats.filter((c) => typeof c === 'string' && c.length > 0) : [];
  const points = Array.isArray(dataPoints) ? dataPoints : [];
  const hasScore = typeof confidenceScore === 'number' && Number.isFinite(confidenceScore);

  // Tidak ada TradePlan sama sekali -> jangan render kotak kosong yang menyiratkan
  // "semuanya baik". Ketiadaan rencana sudah dinyatakan komponen lain.
  if (!hasScore && missing.length === 0 && notes.length === 0 && points.length === 0) {
    return null;
  }

  const levelKey = typeof confidenceLevel === 'string' ? confidenceLevel.toUpperCase() : '';
  const levelClass = LEVEL_STYLE[levelKey] ?? 'border-tv-border bg-tv-bg text-tv-muted';

  return (
    <Card
      padding="none"
      radius="xl"
      elevation="none"
      highlight={false}
      overflow="visible"
      surface="50"
      className="border-tv-border px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-tv-muted">
          Kualitas data rencana
        </span>
        {hasScore && (
          <span className={`rounded-lg border px-2 py-0.5 text-xs font-semibold ${levelClass}`}>
            {levelKey || 'N/A'} {Math.round(confidenceScore as number)}%
          </span>
        )}
      </div>

      {entryReference && (
        <p className="mt-2 text-xs text-tv-muted">
          Acuan entry: <span className="text-tv-text">{entryReference}</span>
        </p>
      )}

      {/* Level harga TradePlan diturunkan dari pivot struktural + ATR, BUKAN dari harga
          penutupan terakhir. Dinyatakan eksplisit supaya angka seperti TP 1.834 di atas
          pivot 1.705 tidak dibaca sebagai "target dari harga sekarang". */}
      <p className="mt-1 text-xs text-tv-muted">
        Level stop-loss dan target diturunkan dari pivot struktural dan ATR, bukan dari
        persentase tetap terhadap harga terakhir.
      </p>

      {missing.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-tv-yellow">Data tidak tersedia saat rencana disusun</p>
          <ul className="mt-1 space-y-0.5">
            {missing.map((item) => (
              <li key={item} className="text-xs text-tv-muted">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-tv-muted">Catatan</p>
          <ul className="mt-1 space-y-0.5">
            {notes.map((item) => (
              <li key={item} className="text-xs text-tv-muted">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {points.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-tv-blue">
            Rincian masukan ({points.filter((p) => p.status === 'AVAILABLE').length}/{points.length} tersedia)
          </summary>
          <ul className="mt-2 space-y-1">
            {points.map((point) => {
              const available = point.status === 'AVAILABLE';
              return (
                <li key={point.key} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-tv-muted">{point.label}</span>
                  <span className={available ? 'text-tv-text' : 'text-tv-red'}>
                    {available ? String(point.value) : 'tidak tersedia'}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </Card>
  );
}

export default TradePlanDisclosure;
