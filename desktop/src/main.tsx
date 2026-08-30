import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const menu = ['Beranda', 'Market Pulse', 'Watchlist', 'Screener', 'Teknikal', 'Fundamental', 'Decision Lab'];

function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span>SahamLens</span></div>
        <p className="eyebrow">ANALISIS SAHAM INDONESIA</p>
        <nav aria-label="Navigasi desktop">
          {menu.map((item, index) => <button className={index === 0 ? 'nav-item active' : 'nav-item'} key={item}>{item}</button>)}
        </nav>
        <div className="sidebar-foot">Desktop V2<br /><span>Terhubung ke SahamLens</span></div>
      </aside>
      <main className="content">
        <header className="topbar"><div><p className="eyebrow">RINGKASAN PASAR</p><h1>Selamat datang di SahamLens</h1></div><div className="status"><i /> Data tersambung</div></header>
        <section className="hero"><div><p className="eyebrow">MARKET OVERVIEW</p><h2>Ambil keputusan dengan lebih tenang.</h2><p>Dashboard desktop khusus untuk memantau pasar, watchlist, dan analisis saham.</p></div><button className="primary">Buka Market Pulse →</button></section>
        <div className="grid"><article><span>IHSG</span><strong>—</strong><small>Data akan dimuat dari API SahamLens</small></article><article><span>Watchlist</span><strong>0 saham</strong><small>Tambahkan saham untuk mulai memantau</small></article><article><span>Decision Lab</span><strong>Siap digunakan</strong><small>Analisis berbasis evidence</small></article></div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
