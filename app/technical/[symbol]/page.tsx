import React, { Suspense } from 'react';
import Link from 'next/link';
import ClientHeader from './ClientHeader';
import StockChartPanel from '@/components/StockChartPanel';
import AskAIButton from '@/components/AskAIButton';
import { Brain, AlertTriangle, Loader2, LogIn, Crown } from 'lucide-react';
import { cookies, headers } from 'next/headers';

async function getCouncilData(symbol: string): Promise<{ data: any; status: number }> {
  // NEXT_PUBLIC_API_URL is never set in Vercel, so it used to always fall back to
  // http://localhost:3001 in production - a server-to-server fetch to a port nothing
  // listens on there, which always failed. Derive the base URL from the actual
  // incoming request instead so this works both locally and on any Vercel deployment.
  const headersList = headers();
  const host = headersList.get('host');
  const protocol = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || `${protocol}://${host}`;
  const cookieStore = cookies();
  const cookieHeader = cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');

  try {
    const res = await fetch(`${baseUrl}/api/council?symbol=${symbol}`, {
      cache: 'no-store',
      headers: {
        'Cookie': cookieHeader
      }
    });
    if (!res.ok) {
      return { data: null, status: res.status };
    }
    return { data: await res.json(), status: 200 };
  } catch (e) {
    console.error('Council API fetch error:', e);
    return { data: null, status: 500 };
  }
}

async function CouncilDisplay({ symbol }: { symbol: string }) {
  const { data: council, status } = await getCouncilData(symbol);

  if (!council) {
    // Chart + indikator dasar tetap tampil publik (lihat StockChartPanel di atas) -
    // hanya ringkasan 10-agent Council AI Pro yang butuh login/upgrade, jadi teaser-nya
    // spesifik per alasan (belum login vs belum Pro) alih-alih pesan error generik.
    if (status === 401) {
      return (
        <div className="bg-tv-card border border-tv-border rounded-xl p-8 text-center">
          <LogIn className="w-8 h-8 mx-auto mb-3 text-tv-blue" />
          <p className="text-white font-semibold mb-1">Login untuk membuka Council AI</p>
          <p className="text-tv-muted text-sm mb-4">Grafik & indikator di atas gratis untuk semua orang. Ringkasan 10 AI Agent Council butuh akun.</p>
          <Link href={`/login?next=/technical/${symbol}`} className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2.5 text-sm font-bold text-white hover:bg-tv-blueHover transition">
            Login Sekarang
          </Link>
        </div>
      );
    }
    if (status === 402) {
      return (
        <div className="bg-tv-card border border-tv-border rounded-xl p-8 text-center">
          <Crown className="w-8 h-8 mx-auto mb-3 text-tv-gold" />
          <p className="text-white font-semibold mb-1">Council AI adalah fitur Pro</p>
          <p className="text-tv-muted text-sm mb-4">Upgrade ke SahamLens Pro untuk melihat rapat lengkap 10 AI Agent Council pada {symbol}.</p>
          <a href="https://wa.me/?text=Halo%2C%20saya%20mau%20upgrade%20ke%20SahamLens%20Pro" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-tv-gold px-5 py-2.5 text-sm font-bold text-tv-bg hover:opacity-90 transition">
            Upgrade Pro
          </a>
        </div>
      );
    }
    return (
      <div className="bg-tv-card border border-tv-border rounded-xl p-8 text-center text-tv-muted">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3 opacity-50" />
        <p>Gagal memuat data Council untuk {symbol}.</p>
      </div>
    );
  }

  const agents = council.agents || [];
  const total = agents.length;
  let buyPct = 0, sellPct = 0, holdPct = 0, waitPct = 0;
  
  if (total > 0) {
    const buyCount = agents.filter((a: any) => a.signal === 'BUY').length;
    const sellCount = agents.filter((a: any) => a.signal === 'SELL').length;
    const holdCount = agents.filter((a: any) => a.signal === 'HOLD').length;
    const waitCount = agents.filter((a: any) => a.signal === 'WAIT').length;
    buyPct = Math.round((buyCount / total) * 100);
    sellPct = Math.round((sellCount / total) * 100);
    holdPct = Math.round((holdCount / total) * 100);
    waitPct = Math.round((waitCount / total) * 100);
  }

  return (
    <div className="space-y-6">
      <div className="bg-tv-card border border-tv-border rounded-xl p-6">
        <h2 className="text-white font-bold mb-4">Final Suggestion</h2>
        
        {total > 0 && (
          <div className="mb-6">
            <div className="flex w-full h-3 rounded-full overflow-hidden mb-3 bg-tv-border">
              {buyPct > 0 && <div style={{width: `${buyPct}%`}} className="bg-tv-green transition-all duration-1000"></div>}
              {holdPct > 0 && <div style={{width: `${holdPct}%`}} className="bg-blue-500 transition-all duration-1000"></div>}
              {waitPct > 0 && <div style={{width: `${waitPct}%`}} className="bg-tv-yellow transition-all duration-1000"></div>}
              {sellPct > 0 && <div style={{width: `${sellPct}%`}} className="bg-tv-red transition-all duration-1000"></div>}
            </div>
            <div className="flex gap-4 text-xs font-mono font-bold">
              {buyPct > 0 && <span className="text-tv-green">{buyPct}% BUY</span>}
              {holdPct > 0 && <span className="text-blue-500">{holdPct}% HOLD</span>}
              {waitPct > 0 && <span className="text-tv-yellow">{waitPct}% WAIT</span>}
              {sellPct > 0 && <span className="text-tv-red">{sellPct}% SELL</span>}
            </div>
          </div>
        )}

        <div className="mt-4 p-4 bg-tv-hover rounded-lg border border-tv-borderLight">
          <p className="text-lg text-white font-mono mb-2">Kesimpulan: <span className="text-tv-green">{council.final_suggestion}</span> (Confidence: {council.final_confidence}%)</p>
          <p className="text-sm text-tv-muted leading-relaxed">{council.summary_id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent: any, idx: number) => {
          const isBuy = agent.signal === 'BUY';
          const isSell = agent.signal === 'SELL';
          const isWait = agent.signal === 'WAIT';
          
          return (
            <div key={idx} className="bg-tv-hover border border-tv-border rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  {agent.name}
                  <AskAIButton prompt={`Tolong jelaskan secara mendalam tentang analisis dari ${agent.name} yang memberikan sinyal ${agent.signal} pada saham ${symbol} berdasarkan alasan: ${agent.reason}. Apakah pandangan ini cukup akurat?`} />
                </h3>
                <span className={`text-xs px-2 py-0.5 rounded font-mono font-semibold ${
                  isBuy ? 'bg-tv-green/20 text-tv-green border border-tv-green/30' :
                  isSell ? 'bg-tv-red/20 text-tv-red border border-tv-red/30' :
                  isWait ? 'bg-tv-yellow/20 text-tv-yellow border border-tv-yellow/30' :
                  'bg-tv-border text-tv-muted'
                }`}>
                  {agent.signal} ({agent.confidence}%)
                </span>
              </div>
              <p className="text-sm text-tv-muted">{agent.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CouncilSkeleton({ symbol }: { symbol: string }) {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-tv-card border border-tv-border rounded-xl p-12 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-tv-green animate-spin mb-4" />
        <p className="text-tv-muted font-mono text-sm">10 AI Agents sedang merapatkan saham {symbol}, mohon tunggu (5-10 detik)...</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-tv-hover border border-tv-border rounded-lg p-10"></div>
        ))}
      </div>
    </div>
  );
}

export default function TechnicalPage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.toUpperCase();

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <ClientHeader symbol={symbol} />
      
      <div className="p-6 space-y-6 max-w-7xl mx-auto w-full mt-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-lg bg-tv-card border border-tv-borderLight text-tv-green">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-2xl text-white tracking-tight">AI Council: {symbol}</h1>
            <p className="text-sm text-tv-muted font-mono">10 AI Agents Debating Stock Analysis (Council AI)</p>
          </div>
        </div>

        <StockChartPanel symbol={symbol} />

        <Suspense fallback={<CouncilSkeleton symbol={symbol} />}>
          <CouncilDisplay symbol={symbol} />
        </Suspense>
      </div>
    </div>
  );
}
