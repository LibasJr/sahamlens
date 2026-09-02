import { Activity, BarChart3, Info, ShieldCheck } from 'lucide-react';
import type { Ticker } from '../main';
import { AIInsights } from './AIInsights';
import { formatIdr } from '../format';

export function OrderPanel({ ticker, apiBaseUrl, apiStatus }: { ticker?: Ticker; apiBaseUrl: string; apiStatus: 'checking' | 'online' | 'offline' }) {
  return <aside className="order-panel">
    <div className="order-profile"><div className="profile-avatar">S</div><div><strong>Riset SahamLens</strong><small>{apiStatus === 'online' ? 'Terhubung ke API SahamLens' : apiStatus === 'offline' ? 'API belum dapat dihubungi' : 'Memeriksa koneksi API'}</small></div><ShieldCheck size={15} className="muted-icon" /></div>
    {!ticker ? <div className="order-empty">Pilih saham untuk melihat analisis terverifikasi.</div> : <>
      <div className="account-balance"><div><span>INSTRUMEN AKTIF</span><strong>{ticker.symbol}</strong></div><Activity size={17} /></div>
      <div className="position-card"><div><span>HARGA TERAKHIR</span><strong>{ticker.price == null ? 'Memuat…' : formatIdr(ticker.price)}</strong></div><div className="position-pnl"><span>PERUBAHAN</span><b className={(ticker.change ?? 0) >= 0 ? 'positive' : 'negative'}>{ticker.change == null ? '—' : `${ticker.change >= 0 ? '+' : ''}${ticker.change.toFixed(2)}%`}</b></div></div>
      <div className="order-form"><div className="estimated"><span>Status data <Info size={12} /></span><strong>{apiStatus === 'online' ? 'API tersedia' : apiStatus === 'offline' ? 'Tidak tersedia' : 'Memeriksa…'}</strong></div><div className="estimated"><span>Mode aplikasi <BarChart3 size={12} /></span><strong>Analisis, bukan trading</strong></div><small className="api-note">Sumber: {apiBaseUrl.replace('https://', '')}</small></div>
      <AIInsights ticker={ticker.symbol} />
    </>}
  </aside>;
}
