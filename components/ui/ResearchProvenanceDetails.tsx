import { Info } from 'lucide-react';
import type { FinancialValueProvenance } from '@/shared/finance/provenance';
import { cn } from '@/lib/utils/cn';

type ProvenanceScalar = number | string | null;

export interface ProvenanceDisplayEntry {
  label: string;
  value: ProvenanceScalar;
  provenance: FinancialValueProvenance | null | undefined;
}

export interface ProvenanceModelIdentity {
  version?: string | null;
  configHash?: string | null;
  status?: string | null;
  universeVersion?: string | null;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return 'Tidak tersedia';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date) + ' WIB';
}

function formatValue(value: ProvenanceScalar): string {
  if (value == null) return 'Tidak tersedia';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('id-ID') : 'Tidak tersedia';
  return value;
}

function transformationLabel(provenance: FinancialValueProvenance): string {
  if (provenance.transformation === 'ESTIMATED' || provenance.isEstimated) return 'Estimasi';
  if (provenance.transformation === 'DERIVED') return 'Turunan deterministik';
  if (provenance.transformation === 'DIRECT') return 'Langsung dari sumber';
  return 'Belum diklasifikasikan';
}

function ProvenanceRows({ provenance }: { provenance: FinancialValueProvenance | null | undefined }) {
  if (!provenance?.source) {
    return <p className="text-tv-yellow">Sumber belum tersedia pada payload ini.</p>;
  }

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-tv-muted">
      <dt>Sumber</dt><dd className="break-all text-tv-text">{provenance.source}</dd>
      <dt>Periode</dt><dd className="text-tv-text">{provenance.period || 'Tidak tersedia'}</dd>
      <dt>As-of</dt><dd className="text-tv-text">{formatTimestamp(provenance.asOf)}</dd>
      <dt>Diambil</dt><dd className="text-tv-text">{formatTimestamp(provenance.retrievedAt)}</dd>
      <dt>Status nilai</dt><dd className="text-tv-text">{transformationLabel(provenance)}</dd>
      <dt>Confidence</dt><dd className="text-tv-text">{provenance.confidence}</dd>
      {provenance.note && <><dt>Catatan</dt><dd className="text-tv-text">{provenance.note}</dd></>}
    </dl>
  );
}

/**
 * Progressive disclosure untuk provenance angka riset. Tidak mengambil data baru dan
 * tidak menyimpulkan sumber dari label UI: seluruh isi berasal dari payload API.
 */
export function ResearchProvenanceDetails({
  entries,
  model,
  label = 'Lihat sumber data',
  className,
}: {
  entries: ProvenanceDisplayEntry[];
  model?: ProvenanceModelIdentity | null;
  label?: string;
  className?: string;
}) {
  if (entries.length === 0 && !model) return null;

  return (
    <details className={cn('group mt-2 text-xs', className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-tv-blue hover:underline [&::-webkit-details-marker]:hidden">
        <Info aria-hidden="true" className="h-3.5 w-3.5" />
        {label}
      </summary>
      <div className="mt-2 rounded-lg border border-tv-border bg-tv-bg p-3 text-left">
        {model && (
          <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-b border-tv-border pb-3 text-tv-muted">
            <dt>Versi model</dt><dd className="break-all text-tv-text">{model.version || 'Tidak tersedia'}</dd>
            <dt>Config hash</dt><dd className="break-all text-tv-text">{model.configHash || 'Tidak tersedia'}</dd>
            <dt>Status</dt><dd className="text-tv-text">{model.status || 'Tidak tersedia'}</dd>
            <dt>Universe</dt><dd className="break-all text-tv-text">{model.universeVersion || 'Tidak tersedia'}</dd>
          </dl>
        )}
        <div className="max-h-72 space-y-3 overflow-y-auto">
          {entries.map((entry, index) => (
            <section key={`${entry.label}-${index}`} aria-label={`Provenance ${entry.label}`}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h4 className="font-semibold text-tv-text">{entry.label}</h4>
                <span className="max-w-[55%] truncate font-number text-tv-muted" title={formatValue(entry.value)}>
                  {formatValue(entry.value)}
                </span>
              </div>
              <ProvenanceRows provenance={entry.provenance} />
            </section>
          ))}
        </div>
      </div>
    </details>
  );
}
