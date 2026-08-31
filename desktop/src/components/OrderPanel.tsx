import { Activity, BarChart3, Info, ShieldCheck } from 'lucide-react';
import type { Ticker } from '../main';
import { AIInsights } from './AIInsights';

export function OrderPanel({ ticker, apiBaseUrl }: { ticker?: Ticker; apiBaseUrl: string }) {
  return <aside className="order-panel">
    <div className="order-profile"><div className="profile-avatar">S</div><div><strong>Analisis SahamLens</strong><small>Terhubung ke API SahamLens</small></div><ShieldCheck size={15} className="muted-icon" /></div>
    {!ticker ? <div className="order-empty">Pilih saham untuk melihat analisis terverifikasi.</div> : <>
      <div className="account-balance"><div><span>INSTRUMEN AKTIF</span><strong>{ticker.symbol}</strong></div><Activity size={17} /></div>
      <div className="position-card"><div><span>HARGA TERAKHIR</span><strong>{ticker.price == null ? 'Memuat…' : `Rp ${ticker.price.toLocaleString('id-ID')}`}</strong></div><div className="position-pnl"><span>PERUBAHAN</span><b className={(ticker.change ?? 0) >= 0 ? 'positive' : 'negative'}>{ticker.change == null ? '—' : `${ticker.change >= 0 ? '+' : ''}${ticker.change.toFixed(2)}%`}</b></div></div>
      <div className="order-form"><div className="estimated"><span>Status data <Info size={12} /></span><strong>Live API</strong></div><div className="estimated"><span>Mode aplikasi <BarChart3 size={12} /></span><strong>Analisis, bukan trading</strong></div><small className="api-note">Sumber: {apiBaseUrl.replace('https://', '')}</small></div>
      <AIInsights ticker={ticker.symbol} />
    </>}
  </aside>;
}
