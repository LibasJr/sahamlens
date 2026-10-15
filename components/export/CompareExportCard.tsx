import React from 'react';
import { ArrowRightLeft, Trophy } from 'lucide-react';

interface CompareExportRow {
  key: string;
  label: string;
  a: string;
  b: string;
  winner: string;
  reason?: string;
}

interface CompareExportCardProps {
  symbol1: string;
  symbol2: string;
  price1: number | null;
  price2: number | null;
  rows: CompareExportRow[];
  conclusion?: string | null;
  exportedAt: Date;
}

export default function CompareExportCard({
  symbol1,
  symbol2,
  price1,
  price2,
  rows,
  conclusion,
  exportedAt,
}: CompareExportCardProps) {
  const clean1 = symbol1.replace('.JK', '');
  const clean2 = symbol2.replace('.JK', '');
  const win1 = rows.filter((r) => r.winner === symbol1).length;
  const win2 = rows.filter((r) => r.winner === symbol2).length;
  const draws = rows.length - win1 - win2;
  const leader = win1 > win2 ? clean1 : win2 > win1 ? clean2 : null;
  const timeLabel =
    exportedAt.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB';

  return (
    <div className="lens-export-dark w-[1080px] h-[1350px] bg-gradient-to-b from-tv-bg to-tv-surface text-white flex flex-col overflow-hidden">
      <div className="bg-gradient-accent px-16 py-9 flex items-center justify-between">
        <div>
          <div className="text-4xl font-heading font-extrabold text-white">SahamLens</div>
          <div className="text-sm font-mono text-white/80 uppercase tracking-wide mt-1">
            Head-to-Head Stock Comparison
          </div>
        </div>
        <div className="text-xl font-mono font-bold px-5 py-2 rounded-full bg-white text-tv-blue flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5" />
          {clean1} vs {clean2}
        </div>
      </div>

      <div className="flex-1 p-16 flex flex-col justify-between">
        <div>
          <div className="grid grid-cols-3 gap-6 mb-8 items-center">
            <div className={`rounded-2xl border p-6 text-center ${win1 >= win2 ? 'border-tv-blue bg-tv-blue/10' : 'border-tv-border bg-tv-card'}`}>
              <div className="text-4xl font-heading font-extrabold">{clean1}</div>
              <div className="text-lg font-mono text-tv-muted mt-1">
                {typeof price1 === 'number' ? `Rp ${price1.toLocaleString('id-ID')}` : 'N/A'}
              </div>
              <div className="mt-3 inline-block rounded-full bg-tv-blue/20 px-4 py-1 text-sm font-mono font-bold text-tv-blue">
                Unggul {win1} Metrik
              </div>
            </div>

            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-tv-card border border-tv-border text-tv-yellow">
                <Trophy className="w-7 h-7" />
              </div>
              <div className="text-xl font-bold">
                {leader ? `${leader} Unggul` : 'Berimbang'}
              </div>
              <div className="text-xs font-mono text-tv-muted">
                {win1} - {win2} ({draws} seri)
              </div>
            </div>

            <div className={`rounded-2xl border p-6 text-center ${win2 >= win1 ? 'border-tv-blue bg-tv-blue/10' : 'border-tv-border bg-tv-card'}`}>
              <div className="text-4xl font-heading font-extrabold">{clean2}</div>
              <div className="text-lg font-mono text-tv-muted mt-1">
                {typeof price2 === 'number' ? `Rp ${price2.toLocaleString('id-ID')}` : 'N/A'}
              </div>
              <div className="mt-3 inline-block rounded-full bg-tv-blue/20 px-4 py-1 text-sm font-mono font-bold text-tv-blue">
                Unggul {win2} Metrik
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-tv-border bg-tv-card overflow-hidden mb-6">
            <div className="grid grid-cols-12 bg-tv-bg px-6 py-3.5 border-b border-tv-border text-xs font-mono uppercase text-tv-muted">
              <div className="col-span-4">Metrik</div>
              <div className="col-span-4 text-center">{clean1}</div>
              <div className="col-span-4 text-center">{clean2}</div>
            </div>
            <div className="divide-y divide-tv-border">
              {rows.slice(0, 8).map((row) => (
                <div key={row.key} className="grid grid-cols-12 px-6 py-3.5 items-center text-sm">
                  <div className="col-span-4 text-tv-muted font-medium">{row.label}</div>
                  <div className={`col-span-4 text-center font-mono ${row.winner === symbol1 ? 'text-tv-blue font-bold' : 'text-white'}`}>
                    {row.a}
                  </div>
                  <div className={`col-span-4 text-center font-mono ${row.winner === symbol2 ? 'text-tv-blue font-bold' : 'text-white'}`}>
                    {row.b}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {conclusion && (
            <div className="bg-tv-card border border-tv-border rounded-xl p-5 mb-4">
              <div className="text-xs font-mono text-tv-muted uppercase mb-1">Kesimpulan Perbandingan</div>
              <div className="text-sm text-white leading-relaxed line-clamp-3">{conclusion}</div>
            </div>
          )}

          <div className="text-xs text-tv-muted leading-relaxed">
            Perbandingan kuantitatif otomatis dari data pasar &amp; laporan keuangan publik di SahamLens. Bukan rekomendasi beli atau jual efek.
          </div>
        </div>

        <div className="text-xs font-mono text-tv-muted border-t border-tv-border pt-4 flex items-center justify-between">
          <span>Data via SahamLens &bull; sahamlens.id</span>
          <span>{timeLabel}</span>
        </div>
      </div>
    </div>
  );
}
