import { Card } from '@/components/ui';
import { getLatestBrokerPeriodSummary } from '@/modules/broker-flow';

function idr(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
    notation: Math.abs(value) >= 1_000_000_000 ? 'compact' : 'standard',
  }).format(value);
}

export default async function BrokerDistributionPanel({ symbol }: { symbol: string }) {
  const data = await getLatestBrokerPeriodSummary(symbol);
  if (!data || data.rows.length === 0) {
    return (
      <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
        <div className="text-xs font-bold uppercase tracking-wider text-tv-muted">Broker Distribution</div>
        <h2 className="mt-1 font-heading text-lg font-bold text-white">Akumulasi / Distribusi Broker</h2>
        <div className="mt-4 rounded-lg border border-tv-yellow/30 bg-tv-yellow/5 p-4">
          <p className="text-sm font-semibold text-tv-yellow">Belum ada data Broker Distribution tersimpan untuk {symbol.replace(/\.JK$/, '')}.</p>
          <p className="mt-1 text-xs leading-relaxed text-tv-muted">
            Jika baru selesai import dari Admin → Broker Summary, muat ulang halaman ini. Panel ini membaca tabel broker_summary_period langsung dari database.
          </p>
        </div>
      </Card>
    );
  }

  const buyers = [...data.rows].filter((row) => row.netValue > 0).sort((a, b) => b.netValue - a.netValue).slice(0, 5);
  const sellers = [...data.rows].filter((row) => row.netValue < 0).sort((a, b) => a.netValue - b.netValue).slice(0, 5);

  return (
    <Card padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-tv-muted">Broker Distribution</div>
          <h2 className="mt-1 font-heading text-lg font-bold text-white">Akumulasi / Distribusi Broker</h2>
          <p className="mt-1 text-xs text-tv-muted">
            Periode {data.startDate} s/d {data.endDate} · as of {data.asOfDate} · {data.rows.length} broker top-subset
          </p>
        </div>
        <div className="rounded-lg border border-tv-border bg-tv-bg px-3 py-2 text-right">
          <div className="lens-meta uppercase tracking-wider text-tv-muted">Net Top-Broker Subset</div>
          <div className={`mt-1 font-number text-lg font-bold ${data.netSubsetValue >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
            {data.netSubsetValue >= 0 ? '+' : ''}{idr(data.netSubsetValue)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-tv-border">
          <div className="border-b border-tv-border bg-tv-bg px-3 py-2 text-xs font-bold text-tv-green">Top Net Buy</div>
          <div className="divide-y divide-tv-border">
            {buyers.length ? buyers.map((row) => (
              <div key={`buy-${row.brokerCode}`} className="grid grid-cols-[60px_1fr_auto] items-center gap-2 px-3 py-2 text-sm">
                <span className="font-mono font-bold text-white">{row.brokerCode}</span>
                <span className="text-xs text-tv-muted">{row.brokerType || '—'}</span>
                <span className="font-number font-semibold text-tv-green">+{idr(row.netValue)}</span>
              </div>
            )) : <div className="px-3 py-4 text-xs text-tv-muted">Tidak ada net buyer pada subset ini.</div>}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-tv-border">
          <div className="border-b border-tv-border bg-tv-bg px-3 py-2 text-xs font-bold text-tv-red">Top Net Sell</div>
          <div className="divide-y divide-tv-border">
            {sellers.length ? sellers.map((row) => (
              <div key={`sell-${row.brokerCode}`} className="grid grid-cols-[60px_1fr_auto] items-center gap-2 px-3 py-2 text-sm">
                <span className="font-mono font-bold text-white">{row.brokerCode}</span>
                <span className="text-xs text-tv-muted">{row.brokerType || '—'}</span>
                <span className="font-number font-semibold text-tv-red">{idr(row.netValue)}</span>
              </div>
            )) : <div className="px-3 py-4 text-xs text-tv-muted">Tidak ada net seller pada subset ini.</div>}
          </div>
        </div>
      </div>

      <div className="lens-table-sticky-col [--lens-sticky-head-bg:rgb(var(--lens-bg))] mt-4 overflow-x-auto rounded-lg border border-tv-border">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-tv-bg text-left lens-meta uppercase tracking-wider text-tv-muted">
            <tr><th className="px-3 py-2">Broker</th><th className="px-3 py-2">Tipe</th><th className="px-3 py-2 text-right">Buy</th><th className="px-3 py-2 text-right">Sell</th><th className="px-3 py-2 text-right">Net</th></tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 15).map((row) => (
              <tr key={row.brokerCode} className="border-t border-tv-border">
                <td className="px-3 py-2 font-mono font-bold text-white">{row.brokerCode}</td>
                <td className="px-3 py-2 text-xs text-tv-muted">{row.brokerType || '—'}</td>
                <td className="px-3 py-2 text-right font-number text-tv-text">{idr(row.buyValue)}</td>
                <td className="px-3 py-2 text-right font-number text-tv-text">{idr(row.sellValue)}</td>
                <td className={`px-3 py-2 text-right font-number font-bold ${row.netValue >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>{row.netValue >= 0 ? '+' : ''}{idr(row.netValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 lens-meta leading-relaxed text-tv-muted">
        Sumber: {data.source}. Data top-broker subset hasil import manual; belum memengaruhi LensScore, quant recommendation, atau advisory.
      </p>
    </Card>
  );
}
