'use client';

const TERMS = [
  ['Bullish', 'indikator cenderung mendukung penguatan.'],
  ['Bearish', 'indikator cenderung menunjukkan pelemahan.'],
  ['Netral', 'belum ada arah yang cukup kuat.'],
  ['MA200', 'rata-rata harga 200 hari untuk konteks tren jangka panjang.'],
  ['CMF', 'proxy tekanan beli/jual berbasis posisi harga dan volume; bukan broker flow resmi.'],
  ['MOS', 'selisih harga pasar terhadap estimasi nilai wajar model.'],
] as const;

export default function AnalysisGlossary({ compact = false }: { compact?: boolean }) {
  return (
    <details className="group rounded-lg border border-tv-border bg-tv-bg/60">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-tv-muted transition-colors hover:text-tv-text">
        Istilah analisis <span className="font-normal text-tv-muted/80">— penjelasan singkat untuk pemula</span>
      </summary>
      <div className={`border-t border-tv-border px-3 py-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'} grid gap-x-5 gap-y-2`}>
        {TERMS.map(([term, meaning]) => (
          <div key={term} className="text-[11px] leading-relaxed text-tv-muted">
            <span className="font-semibold text-tv-text">{term}</span> — {meaning}
          </div>
        ))}
      </div>
    </details>
  );
}
