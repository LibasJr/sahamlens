'use client';

import { Activity, FileText, LockKeyhole, Newspaper, ShieldCheck, Target } from 'lucide-react';
import { calculateEmaSeries } from '@/modules/technical/service/ema';
import { calculateRsi } from '@/modules/technical/service/rsi';
import { Badge, Button, Card } from '@/components/ui';
import type { DashboardCandle } from '@/components/dashboard/dashboard-analysis';

export type GuestTechnicalSnapshot = {
  price: number;
  changePct: number;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  trend: 'Bullish' | 'Bearish' | 'Netral';
  closes: number[];
};

export function buildGuestTechnicalSnapshot(candles: DashboardCandle[]): GuestTechnicalSnapshot | null {
  const closes = candles
    .map((candle) => candle.close)
    .filter((close): close is number => typeof close === 'number' && Number.isFinite(close) && close > 0);
  if (closes.length < 2) return null;

  const price = closes[closes.length - 1];
  const previous = closes[closes.length - 2];
  const ema20 = calculateEmaSeries(closes, 20).at(-1) ?? null;
  const ema50 = calculateEmaSeries(closes, 50).at(-1) ?? null;
  const rsi14 = calculateRsi(closes, 14);
  const trend = ema20 == null || ema50 == null ? 'Netral' : ema20 > ema50 ? 'Bullish' : ema20 < ema50 ? 'Bearish' : 'Netral';

  return {
    price,
    changePct: ((price - previous) / previous) * 100,
    ema20,
    ema50,
    rsi14,
    trend,
    closes: closes.slice(-60),
  };
}

function PriceChart({ closes }: { closes: number[] }) {
  const width = 900;
  const height = 220;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const points = closes.map((close, index) => {
    const x = (index / Math.max(1, closes.length - 1)) * width;
    const y = height - 12 - ((close - min) / range) * (height - 24);
    return `${x},${y}`;
  }).join(' ');
  const rising = closes[closes.length - 1] >= closes[0];
  const color = rising ? '#22c55e' : '#ef4444';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik harga 60 sesi terakhir" className="h-[220px] w-full">
      {[55, 110, 165].map((y) => <line key={y} x1="0" x2={width} y1={y} y2={y} stroke="rgba(255,255,255,.06)" />)}
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const LOCKED_FEATURES = [
  { label: 'LensScore & keputusan', icon: ShieldCheck },
  { label: 'Target Profit & Cut Loss', icon: Target },
  { label: 'Indikator lanjutan', icon: Activity },
  { label: 'Berita & sentimen', icon: Newspaper },
  { label: 'Laporan PDF', icon: FileText },
  { label: 'Riwayat akurasi', icon: LockKeyhole },
];

export function GuestTechnicalPreview({
  ticker,
  candles,
  onUnlock,
}: {
  ticker: string;
  candles: DashboardCandle[];
  onUnlock: () => void;
}) {
  const snapshot = buildGuestTechnicalSnapshot(candles);
  if (!snapshot) return null;

  const metrics = [
    { label: 'Harga terakhir', value: `Rp ${Math.round(snapshot.price).toLocaleString('id-ID')}` },
    { label: 'Perubahan', value: `${snapshot.changePct >= 0 ? '+' : ''}${snapshot.changePct.toFixed(2)}%` },
    { label: 'EMA 20 / 50', value: snapshot.ema20 != null && snapshot.ema50 != null ? `${Math.round(snapshot.ema20).toLocaleString('id-ID')} / ${Math.round(snapshot.ema50).toLocaleString('id-ID')}` : 'Data belum cukup' },
    { label: 'RSI 14', value: snapshot.rsi14 == null ? 'Data belum cukup' : snapshot.rsi14.toFixed(1) },
  ];

  return (
    <div className="space-y-5">
      <Card padding="md" radius="2xl" elevation="sm" className="border-tv-blue/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-xl font-bold text-tv-text">Preview LensTechnical {ticker.replace(/\.JK$/i, '')}</h2>
              <Badge variant="info">Preview tamu</Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tv-muted">
              Data harga aktual. Daftar gratis untuk membuka seluruh analisis selama masa pengujian.
            </p>
          </div>
          <Button onClick={onUnlock} className="shrink-0">Daftar Gratis</Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} padding="sm" radius="xl" elevation="none" highlight={false}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-tv-muted">{metric.label}</p>
            <p className="mt-2 font-number text-base font-bold text-tv-text sm:text-lg">{metric.value}</p>
          </Card>
        ))}
      </div>

      <Card padding="md" radius="2xl" elevation="sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-sm font-semibold text-tv-text">Grafik harga publik</h3>
            <p className="mt-1 text-xs text-tv-muted">60 sesi terakhir · tren EMA: {snapshot.trend}</p>
          </div>
          <Badge variant={snapshot.trend === 'Bullish' ? 'success' : snapshot.trend === 'Bearish' ? 'danger' : 'neutral'}>{snapshot.trend}</Badge>
        </div>
        <PriceChart closes={snapshot.closes} />
      </Card>

      <section aria-labelledby="locked-features-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h3 id="locked-features-heading" className="font-heading text-sm font-semibold text-tv-text">Analisis lengkap</h3>
            <p className="mt-1 text-xs text-tv-muted">Pilih bagian terkunci untuk melihat cara membukanya.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LOCKED_FEATURES.map(({ label, icon: Icon }) => (
            <button key={label} type="button" onClick={onUnlock} className="group rounded-2xl border border-white/[0.075] bg-tv-card p-4 text-left transition hover:border-tv-blue/35 hover:bg-tv-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue/60">
              <div className="flex items-center justify-between gap-3">
                <Icon className="h-5 w-5 text-tv-muted transition group-hover:text-tv-blue" aria-hidden="true" />
                <LockKeyhole className="h-4 w-4 text-tv-yellow" aria-hidden="true" />
              </div>
              <p className="mt-5 text-sm font-semibold text-tv-text">{label}</p>
              <p className="mt-1 text-xs text-tv-muted">Masuk atau daftar untuk membuka</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
