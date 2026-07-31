import React, { useState, useMemo, useRef } from 'react';
import { TrendingUp, TrendingDown, BarChart3, Activity, Hash, ArrowDownToLine, ArrowUpFromLine, DollarSign, ChevronRight, Clock3, ArrowUpRight, ArrowDownRight, LineChart } from 'lucide-react';

const App = () => {
  const [timeframe, setTimeframe] = useState('1M');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  // Mock BBCA data - 45 points
  const chartData = useMemo(() => {
    const base = 9450;
    const points = [
      9450, 9480, 9460, 9520, 9580, 9550, 9620, 9680, 9650, 9700,
      9750, 9720, 9780, 9850, 9820, 9900, 9870, 9830, 9790, 9810,
      9750, 9720, 9680, 9740, 9780, 9750, 9800, 9850, 9920, 9880,
      9850, 9780, 9820, 9860, 9900, 9875, 9920, 9960, 9930, 9850,
      9880, 9910, 9860, 9820, 9850
    ];
    return points.map((price, i) => {
      // MA20
      const slice20 = points.slice(Math.max(0, i - 19), i + 1);
      const ma20 = slice20.reduce((a,b)=>a+b,0)/slice20.length;
      // MA50 (approx with 35)
      const slice50 = points.slice(Math.max(0, i - 34), i + 1);
      const ma50 = slice50.reduce((a,b)=>a+b,0)/slice50.length;
      return { i, price, ma20, ma50, time: `10:${String(i).padStart(2,'0')}` };
    });
  }, []);

  const currentPrice = chartData[chartData.length - 1].price;
  const prevClose = 9750;
  const change = currentPrice - prevClose;
  const changePct = (change/prevClose)*100;

  // chart scaling
  const width = 900;
  const height = 300;
  const pad = { t: 20, r: 20, b: 30, l: 10 };
  const minY = Math.min(...chartData.map(d=>Math.min(d.price, d.ma20, d.ma50))) - 50;
  const maxY = Math.max(...chartData.map(d=>Math.max(d.price, d.ma20, d.ma50))) + 50;
  const xScale = (i:number) => pad.l + (i/(chartData.length-1)) * (width - pad.l - pad.r);
  const yScale = (v:number) => pad.t + (1 - (v - minY)/(maxY - minY)) * (height - pad.t - pad.b);

  const pricePath = chartData.map((d,i)=> `${i===0?'M':'L'} ${xScale(i)} ${yScale(d.price)}`).join(' ');
  const ma20Path = chartData.map((d,i)=> `${i===0?'M':'L'} ${xScale(i)} ${yScale(d.ma20)}`).join(' ');
  const ma50Path = chartData.map((d,i)=> `${i===0?'M':'L'} ${xScale(i)} ${yScale(d.ma50)}`).join(' ');

  // area gradient
  const areaPath = `${pricePath} L ${xScale(chartData.length-1)} ${height - pad.b} L ${xScale(0)} ${height - pad.b} Z`;

  const handleMouseMove = (e: React.MouseEvent) => {
    if(!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const ratio = relX / rect.width;
    const idx = Math.round(ratio * (chartData.length-1));
    setHoverIdx(Math.max(0, Math.min(chartData.length-1, idx)));
  };

  const marketCards = [
    {
      id: 'gainer',
      title: 'Peringkat Keuntungan Tertinggi Hari Ini',
      sub: 'Top Gainer',
      accent: 'emerald',
      Icon: TrendingUp,
      items: [
        { code: 'GOTO', name: 'GoTo Gojek', change: '+12.35%', value: 'Rp 89', vol: '2.1B' },
        { code: 'BREN', name: 'Barito Renewables', change: '+8.21%', value: 'Rp 4.820', vol: '890M' },
        { code: 'CUAN', name: 'Petrindo Jaya', change: '+7.44%', value: 'Rp 6.150', vol: '560M' },
        { code: 'AMMN', name: 'Amman Mineral', change: '+5.92%', value: 'Rp 7.925', vol: '420M' },
      ]
    },
    {
      id: 'loser',
      title: 'Tekanan Jual Tertinggi',
      sub: 'Top Loser',
      accent: 'red',
      Icon: TrendingDown,
      items: [
        { code: 'BUKA', name: 'Bukalapak.com', change: '-5.12%', value: 'Rp 148', vol: '1.2B' },
        { code: 'ARTO', name: 'Bank Jago', change: '-4.24%', value: 'Rp 2.480', vol: '340M' },
        { code: 'BBHI', name: 'Allo Bank', change: '-3.88%', value: 'Rp 1.095', vol: '210M' },
        { code: 'BRIS', name: 'Bank Syariah Indo', change: '-2.91%', value: 'Rp 2.650', vol: '180M' },
      ]
    },
    {
      id: 'value',
      title: 'Nilai Transaksi Terbesar',
      sub: 'Top Value • Rp Triliun',
      accent: 'blue',
      Icon: DollarSign,
      items: [
        { code: 'BBCA', name: 'Bank Central Asia', change: 'Rp 1.24 T', value: '+1.03%', vol: '126M lembar' },
        { code: 'BBRI', name: 'Bank Rakyat Indo', change: 'Rp 0.98 T', value: '-0.41%', vol: '185M lembar' },
        { code: 'TLKM', name: 'Telkom Indonesia', change: 'Rp 0.87 T', value: '+0.72%', vol: '210M lembar' },
        { code: 'BMRI', name: 'Bank Mandiri', change: 'Rp 0.76 T', value: '+1.15%', vol: '112M lembar' },
      ]
    },
    {
      id: 'volume',
      title: 'Volume Perdagangan Tertinggi',
      sub: 'Top Volume • Lot',
      accent: 'slate',
      Icon: BarChart3,
      items: [
        { code: 'GOTO', name: 'GoTo Gojek', change: '2.1 M lot', value: 'Rp 18.4 M', vol: '+12.3%' },
        { code: 'BUMI', name: 'Bumi Resources', change: '1.52 M lot', value: 'Rp 142 B', vol: '+3.2%' },
        { code: 'DEWA', name: 'Darma Henwa', change: '1.18 M lot', value: 'Rp 98 B', vol: '+5.1%' },
        { code: 'BRMS', name: 'Bumi Resources Min', change: '0.94 M lot', value: 'Rp 76 B', vol: '+1.8%' },
      ]
    },
    {
      id: 'freq',
      title: 'Frekuensi Transaksi Teraktif',
      sub: 'Top Frequency • Transaksi',
      accent: 'indigo',
      Icon: Hash,
      items: [
        { code: 'BBRI', name: 'Bank Rakyat Indo', change: '45.2 rb', value: '12.4 rb buyer', vol: 'Avg Rp 5.2jt' },
        { code: 'TLKM', name: 'Telkom Indonesia', change: '38.7 rb', value: '9.8 rb buyer', vol: 'Avg Rp 6.1jt' },
        { code: 'BBCA', name: 'Bank Central Asia', change: '32.1 rb', value: '8.2 rb buyer', vol: 'Avg Rp 12.4jt' },
        { code: 'ASII', name: 'Astra International', change: '28.4 rb', value: '7.1 rb buyer', vol: 'Avg Rp 8.3jt' },
      ]
    },
    {
      id: 'foreignBuy',
      title: 'Akumulasi Asing Masuk',
      sub: 'Net Foreign Buy',
      accent: 'emerald',
      Icon: ArrowDownToLine,
      items: [
        { code: 'BMRI', name: 'Bank Mandiri', change: '+Rp 124.5 M', value: 'Foreign 32%', vol: '+1.15%' },
        { code: 'BBCA', name: 'Bank Central Asia', change: '+Rp 92.3 M', value: 'Foreign 41%', vol: '+1.03%' },
        { code: 'AMMN', name: 'Amman Mineral', change: '+Rp 78.1 M', value: 'Foreign 18%', vol: '+5.92%' },
        { code: 'MDKA', name: 'Merdeka Copper', change: '+Rp 54.2 M', value: 'Foreign 22%', vol: '+2.14%' },
      ]
    },
    {
      id: 'foreignSell',
      title: 'Distribusi Asing Keluar',
      sub: 'Net Foreign Sell',
      accent: 'red',
      Icon: ArrowUpFromLine,
      items: [
        { code: 'BBRI', name: 'Bank Rakyat Indo', change: '-Rp 84.2 M', value: 'Foreign 28%', vol: '-0.41%' },
        { code: 'TLKM', name: 'Telkom Indonesia', change: '-Rp 47.8 M', value: 'Foreign 35%', vol: '+0.72%' },
        { code: 'ASII', name: 'Astra International', change: '-Rp 32.1 M', value: 'Foreign 24%', vol: '-0.88%' },
        { code: 'UNVR', name: 'Unilever Indonesia', change: '-Rp 28.4 M', value: 'Foreign 31%', vol: '-1.22%' },
      ]
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-[#3A86FF]/20">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'); *{font-family:'Plus Jakarta Sans', Inter, sans-serif}`}</style>

      {/* HEADER DEEP NAVY */}
      <header className="sticky top-0 z-50 bg-[#0A1931] text-white border-b border-white/10">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-[64px] items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[#3A86FF] grid place-items-center font-bold text-[14px] tracking-tight">SL</div>
                <span className="font-bold text-[16px] tracking-tight">SahamLens</span>
                <span className="hidden sm:inline-flex ml-2 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-widest uppercase">Institutional AI</span>
              </div>
              <div className="hidden md:flex items-center gap-3 pl-6 border-l border-white/15">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">IHSG Hari Ini</span>
                  <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[18px] font-bold tracking-tight">7.254,32</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[12px] font-semibold text-emerald-300">
                    <ArrowUpRight className="h-3 w-3" /> +1.24% (+88.4)
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 px-3 py-1.5">
                <Clock3 className="h-3.5 w-3.5 text-white/60" />
                <span className="text-[12px] font-medium text-white/80">Market Buka</span>
                <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.2)] ml-1" />
                <span className="text-[12px] font-semibold">09:00 - 15:50 WIB</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-medium text-white/50">
                <span className="hidden sm:inline">Kamis, 8 Mei 2025 • 10:42 WIB</span>
                <span className="sm:hidden">10:42 WIB</span>
              </div>
            </div>
          </div>
          {/* mobile IHSG */}
          <div className="flex md:hidden items-center justify-between pb-3 -mt-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-white/50 font-semibold">IHSG</span>
              <span className="text-[14px] font-bold">7.254,32</span>
              <span className="text-[11px] font-semibold text-emerald-300">+1.24%</span>
            </div>
            <span className="text-[10px] text-emerald-300 flex items-center gap-1"><span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-pulse" />Market Buka</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {/* Title Block */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] sm:text-[28px] font-bold tracking-tight text-[#0A1931]">Ringkasan Pasar Hari Ini</h1>
            <p className="mt-1 text-[13px] sm:text-[14px] text-slate-500 font-medium">Data real-time dari Bursa Efek Indonesia, diperbarui setiap 15 menit • <span className="text-[#3A86FF] font-semibold">AI Confidence 87%</span></p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Powered by</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700 shadow-sm">Bloomberg • Stockbit • IDX</span>
          </div>
        </div>

        {/* FEATURED CHART CARD */}
        <div className="relative overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_10px_40px_-12px_rgba(10,25,49,0.12)]">
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_0.9fr]">
            {/* Left Chart */}
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-xl bg-[#0A1931] text-white grid place-items-center font-bold text-[13px]">BBCA</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[18px] font-bold text-[#0A1931] tracking-tight">BBCA.JK — Bank Central Asia Tbk</h2>
                      <span className="hidden sm:inline-flex rounded-full bg-[#0A1931] px-2 py-0.5 text-[10px] font-bold tracking-widest text-white">LQ45 • UNGGULAN</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px]">
                      <span className="font-semibold text-slate-900">Rp {currentPrice.toLocaleString('id-ID')}</span>
                      <span className={`inline-flex items-center gap-1 font-semibold ${change>=0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {change>=0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />} {change>=0?'+':''}{change} ({changePct>=0?'+':''}{changePct.toFixed(2)}%)
                      </span>
                      <span className="text-slate-400">Vol: 126M • Val: Rp 1.24T</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full bg-slate-100 p-1">
                  {['1D','1W','1M','3M','1Y'].map(t=>(
                    <button key={t} onClick={()=>setTimeframe(t)} className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wide transition ${timeframe===t ? 'bg-[#0A1931] text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div ref={chartRef} onMouseMove={handleMouseMove} onMouseLeave={()=>setHoverIdx(null)} className="relative mt-6 select-none rounded-xl bg-[#F8FAFC] border border-slate-100 overflow-hidden">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[260px] sm:h-[320px]" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="priceGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#3A86FF" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3A86FF" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* grid */}
                  {[0,1,2,3].map(i=>{
                    const y = pad.t + (i/3)*(height-pad.t-pad.b);
                    return <line key={i} x1={pad.l} x2={width-pad.r} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray="4 6" strokeWidth="1" />
                  })}
                  <path d={areaPath} fill="url(#priceGrad)" />
                  <path d={ma50Path} fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.8" />
                  <path d={ma20Path} fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="2 0" opacity="0.9" />
                  <path d={pricePath} fill="none" stroke="#0A1931" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

                  {/* signal markers */}
                  <g>
                    <circle cx={xScale(13)} cy={yScale(chartData[13].price)} r="5" fill="#10B981" stroke="white" strokeWidth="2" />
                    <circle cx={xScale(28)} cy={yScale(chartData[28].price)} r="5" fill="#EF4444" stroke="white" strokeWidth="2" />
                  </g>

                  {hoverIdx!==null && (
                    <>
                      <line x1={xScale(hoverIdx)} x2={xScale(hoverIdx)} y1={pad.t} y2={height-pad.b} stroke="#0A1931" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
                      <circle cx={xScale(hoverIdx)} cy={yScale(chartData[hoverIdx].price)} r="6" fill="#3A86FF" stroke="white" strokeWidth="2.5" />
                    </>
                  )}
                </svg>

                {/* Tooltip */}
                {hoverIdx!==null && (
                  <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-3 rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-xl text-[11px] sm:min-w-[200px] flex gap-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Harga</div>
                      <div className="text-[14px] font-bold text-[#0A1931]">Rp {chartData[hoverIdx].price.toLocaleString('id-ID')}</div>
                    </div>
                    <div className="h-8 w-px bg-slate-200 hidden sm:block" />
                    <div className="hidden sm:block">
                      <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">MA20 / MA50</div>
                      <div className="font-semibold text-amber-600">{chartData[hoverIdx].ma20.toFixed(0)} <span className="text-slate-400">/</span> <span className="text-slate-500">{chartData[hoverIdx].ma50.toFixed(0)}</span></div>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-semibold tracking-wide text-slate-400">
                  <span>09:00</span><span>11:30</span><span>15:00</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px]">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#0A1931]" />Harga BBCA</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-amber-500" />MA20 (20 hari)</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-slate-400 border border-dashed" />MA50 (50 hari)</span>
                <span className="ml-auto inline-flex items-center gap-1 text-emerald-600 font-bold"><span className="h-2 w-2 rounded-full bg-emerald-500" />BUY signal 18 Apr</span>
              </div>
            </div>

            {/* Right Panel - Institutional Analysis */}
            <div className="border-t lg:border-t-0 lg:border-l border-slate-200 bg-[#FBFDFF] p-5 sm:p-7 flex flex-col">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-500">Analisis Institusional AI</h3>
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-bold text-emerald-700">BULLISH 73%</span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Harga Terakhir</div>
                  <div className="mt-1 text-[20px] font-bold tracking-tight text-[#0A1931]">Rp 9.850</div>
                  <div className="text-[11px] font-semibold text-emerald-600">+1.03% hari ini</div>
                </div>
                <div className="rounded-xl bg-[#0A1931] p-3 text-white">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Sinyal AI Lens</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[15px] font-bold"><span className="h-5 w-5 rounded-full bg-emerald-400 grid place-items-center text-[#0A1931] text-[11px]">↑</span> BUY</div>
                  <div className="text-[11px] text-white/70">Hold • TP Rp 10.250</div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {[
                  { k: 'MA20', v: '9.812', s: 'Di atas', c: 'emerald' },
                  { k: 'MA50', v: '9.645', s: 'Golden Cross', c: 'blue' },
                  { k: 'RSI (14)', v: '62.4', s: 'Netral Cenderung Beli', c: 'slate' },
                  { k: 'Volume', v: '126M', s: '+18% vs rata-rata', c: 'emerald' },
                ].map(r=>(
                  <div key={r.k} className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`h-7 w-7 rounded-full grid place-items-center text-[11px] font-bold ${r.c==='emerald'?'bg-emerald-50 text-emerald-700': r.c==='blue'?'bg-blue-50 text-blue-700':'bg-slate-100 text-slate-600'}`}>{r.k[0]}</div>
                      <div>
                        <div className="text-[12px] font-bold text-slate-900">{r.k}</div>
                        <div className="text-[10px] font-medium text-slate-500">{r.s}</div>
                      </div>
                    </div>
                    <div className="text-[12px] font-bold text-[#0A1931]">{r.v}</div>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-5">
                <div className="rounded-xl bg-gradient-to-br from-[#0A1931] to-[#1E293B] p-4 text-white">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-widest text-white/60">Ringkasan AI</div>
                      <p className="mt-1.5 text-[12px] leading-[1.5] text-white/85">BBCA bertahan di atas MA20 dengan volume akumulasi institusional. Foreign inflow 3 hari berturut-turut. Potensi melanjutkan tren bullish jangka menengah.</p>
                    </div>
                    <LineChart className="h-4 w-4 text-white/40 shrink-0 mt-1" />
                  </div>
                </div>
                <button className="mt-3 group flex w-full items-center justify-center gap-2 rounded-full bg-[#3A86FF] px-5 py-3 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_#3A86FF] hover:bg-[#2f6fd6] transition">
                  Lihat Analisis Lengkap
                  <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </button>
                <div className="mt-2 text-center text-[10px] font-medium text-slate-400">Estimasi waktu baca • 2 menit • Update 10:42 WIB</div>
              </div>
            </div>
          </div>
        </div>

        {/* GRID CARDS */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
          {marketCards.map((card) => {
            const isPositive = card.accent === 'emerald' || card.accent === 'blue' || card.accent === 'indigo';
            const accentMap: any = {
              emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', light: 'bg-emerald-500/10' },
              red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', light: 'bg-red-500/10' },
              blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-[#3A86FF]', light: 'bg-[#3A86FF]/10' },
              slate: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-600', light: 'bg-slate-500/10' },
              indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500', light: 'bg-indigo-500/10' },
            };
            const accent = accentMap[card.accent] || accentMap.slate;

            return (
              <div key={card.id} className="group relative rounded-[18px] border border-slate-200 bg-white p-5 shadow-[0_6px_24px_-12px_rgba(10,25,49,0.08)] hover:shadow-[0_12px_32px_-10px_rgba(10,25,49,0.14)] hover:-translate-y-[1px] transition-all">
                {/* header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-xl grid place-items-center border ${accent.bg} ${accent.border} ${accent.text}`}>
                      <card.Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-bold leading-tight tracking-tight text-[#0A1931] max-w-[180px]">{card.title}</h4>
                      <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${accent.bg} ${accent.text}`}>{card.sub}</span>
                    </div>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${accent.dot} shadow-[0_0_0_4px_rgba(0,0,0,0.04)]`} />
                </div>

                {/* list */}
                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden bg-slate-50/50">
                  {card.items.map((it, idx) => {
                    const isUp = it.change.includes('+') || it.change.includes('M lot') && idx < 2 ? true : it.change.startsWith('+') || it.change.startsWith('Rp') && it.change.includes('+') ? true : it.change.includes('+');
                    const isDown = it.change.startsWith('-');
                    return (
                      <div key={it.code} className="flex items-center justify-between gap-2 bg-white px-3 py-[11px] hover:bg-slate-50 transition">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0A1931] text-[10px] font-bold text-white shrink-0">{idx+1}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] font-bold tracking-tight text-[#0A1931]">{it.code}</span>
                              <span className="hidden sm:inline text-[11px] text-slate-500 truncate max-w-[90px]">{it.name}</span>
                            </div>
                            <div className="text-[10px] font-medium text-slate-400 sm:hidden truncate">{it.name}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-[12px] font-bold tracking-tight flex items-center justify-end gap-1 ${isDown ? 'text-red-600' : isPositive && (card.id.includes('Buy') || card.id==='gainer' || card.id==='freq') ? 'text-emerald-600' : card.id==='loser' || card.id.includes('Sell') ? 'text-red-600' : 'text-[#0A1931]'}`}>
                            {!card.id.includes('value') && !card.id.includes('volume') && !card.id.includes('freq') && card.id!=='gainer' && card.id!=='loser' && (
                              <span className={`h-1 w-1 rounded-full ${isDown ? 'bg-red-500':'bg-emerald-500'}`} />
                            )}
                            {it.change}
                          </div>
                          <div className="text-[10px] font-medium text-slate-500">{it.value}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Update 10:42 WIB • IDX</span>
                  <button className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3A86FF] hover:text-[#0A1931] transition">
                    Lihat semua <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Meta */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium">Data disinkronisasi langsung dari IDX • Delay 15 menit • Sumber: RTI, Investing.com</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold">© 2025 SahamLens • Institutional AI</span>
            <span className="hidden sm:inline font-medium">v2.4.1 • Build 08 May</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
