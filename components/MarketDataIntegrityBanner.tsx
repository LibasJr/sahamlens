import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getLatestMarketIntegrity } from '@/modules/market-data-integrity/repository/market-data-reconciliation.repository';
import { Card } from '@/components/ui/Card';

export default async function MarketDataIntegrityBanner({ ticker }: { ticker: string }) {
  const row = await getLatestMarketIntegrity(ticker);
  if (!row) return null;

  if (row.status !== 'MATCH') {
    const mismatch = row.status === 'MISMATCH';
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div>
          <p className="font-semibold text-amber-200">{mismatch ? 'Data harga sedang diperiksa' : 'Verifikasi lintas sumber belum lengkap'}</p>
          <p className="mt-1 text-tv-muted">
            {mismatch
              ? <>Penutupan {row.tradeDate} berbeda antara sumber operasional dan sumber pembanding. SahamLens tidak menganggap salah satu angka pasti benar.</>
              : <>Pada {row.tradeDate}, salah satu atau kedua sumber tidak menyediakan pasangan harga yang bisa diverifikasi. Status ini tidak dihitung sebagai bukti kecocokan.</>}
          </p>
        </div>
      </div>
    );
  }

  if (row.status === 'MATCH') {
    return (
      <Card padding="none" radius="lg" elevation="none" highlight={false} overflow="visible" surface="60" className="flex items-center gap-2 border-tv-border px-3 py-2 text-xs text-tv-muted">
        <CheckCircle2 className="h-3.5 w-3.5 text-tv-green" />
        Harga penutupan {row.tradeDate} cocok dengan sumber pembanding independen.
      </Card>
    );
  }

  return null;
}
