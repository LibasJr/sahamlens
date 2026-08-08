import React, { Suspense } from 'react';
import Link from 'next/link';
import ClientHeader from './ClientHeader';
import StockChartPanel from '@/components/StockChartPanel';
import { LogIn, Crown } from 'lucide-react';
import { cookies, headers } from 'next/headers';
import { WA_NUMBER } from '@/shared/constants/app.constants';
import { getPaymentMethods } from '@/shared/config/payment';
import { PageContainer, Skeleton, EmptyState, LoadingFact, TickerAvatar } from '@/components/ui';
import TechnicalExportSection from '@/components/export/TechnicalExportSection';

async function getCouncilData(symbol: string): Promise<{ data: any; status: number }> {
  // NEXT_PUBLIC_API_URL is never set in Vercel, so it used to always fall back to
  // http://localhost:3001 in production - a server-to-server fetch to a port nothing
  // listens on there, which always failed. Derive the base URL from the actual
  // incoming request instead so this works both locally and on any Vercel deployment.
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || `${protocol}://${host}`;
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c: { name: string; value: string }) => `${c.name}=${c.value}`).join('; ');

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
    console.error('LensAI API fetch error:', e);
    return { data: null, status: 500 };
  }
}

async function getOrchestratorData(symbol: string): Promise<any | null> {
  const headersList = await headers();
  const host = headersList.get('host');
  const protocol =
    host?.startsWith('localhost') || host?.startsWith('127.0.0.1')
      ? 'http'
      : 'https';

  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL || `${protocol}://${host}`;

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const res = await fetch(`${baseUrl}/api/agents/orchestrator`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        ticker: symbol,
      }),
    });

    if (!res.ok) return null;

    return await res.json();
  } catch (error) {
    console.error('Orchestrator API fetch error:', error);
    return null;
  }
}

async function OrchestratorRecommendation({
  symbol,
}: {
  symbol: string;
}) {
  const result = await getOrchestratorData(symbol);
  const quant = result?.quant;

  if (!quant) return null;

  const decision =
    typeof quant.decision === 'string'
      ? quant.decision
      : 'DATA TIDAK TERSEDIA';

  const score =
    typeof quant.final_score === 'number'
      ? quant.final_score
      : null;

  const coverage =
    typeof quant.coverage_weight_pct === 'number'
      ? quant.coverage_weight_pct
      : null;

  const decisionClass =
    decision.includes('BUY')
      ? 'text-tv-green'
      : decision.includes('SELL')
        ? 'text-tv-red'
        : decision === 'DATA TERBATAS' || decision === 'DATA TIDAK TERSEDIA'
          ? 'text-tv-yellow'
          : 'text-tv-blue';

  return (
    <div className="mb-6 rounded-xl border border-tv-border bg-tv-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 text-xs font-bold uppercase tracking-wider text-tv-muted">
            SahamLens Quant Recommendation
          </div>

          <div className={`text-3xl font-bold ${decisionClass}`}>
            {decision}
          </div>

          {typeof quant.master_agent_summary === 'string' && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tv-muted">
              {quant.master_agent_summary}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-3">
          <div className="min-w-24 rounded-lg border border-tv-borderLight bg-tv-bg p-3 text-center">
            <div className="text-xs uppercase text-tv-muted">Score</div>
            <div className="text-2xl font-bold text-white">
              {score == null ? 'N/A' : score}
            </div>
            {score != null && (
              <div className="text-xs text-tv-muted">/100</div>
            )}
          </div>

          <div className="min-w-24 rounded-lg border border-tv-borderLight bg-tv-bg p-3 text-center">
            <div className="text-xs uppercase text-tv-muted">Coverage</div>
            <div className="text-2xl font-bold text-white">
              {coverage == null ? 'N/A' : coverage}
            </div>
            {coverage != null && (
              <div className="text-xs text-tv-muted">/82</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
async function LensAIAnalysisDisplay({ symbol }: { symbol: string }) {
  const { data: council, status } = await getCouncilData(symbol);

  if (!council) {
    // Chart + indikator dasar tetap tampil publik (lihat StockChartPanel di atas) -
    // hanya ringkasan 10-agent LensAI Pro yang butuh login/upgrade, jadi teaser-nya
    // spesifik per alasan (belum login vs belum Pro) alih-alih pesan error generik.
    if (status === 401) {
      return (
        <div className="bg-tv-card border border-tv-border rounded-xl p-8 text-center">
          <LogIn className="w-8 h-8 mx-auto mb-3 text-tv-blue" />
          <p className="text-white font-semibold mb-1">Login untuk membuka LensAI</p>
          <p className="text-tv-muted text-sm mb-4">Grafik & indikator di atas gratis untuk semua orang. Ringkasan Stock Analysis LensAI butuh akun.</p>
          <Link href={`/login?next=/technical/${symbol}`} className="inline-flex items-center gap-2 rounded-full bg-tv-blue px-5 py-2.5 text-sm font-bold text-white hover:bg-tv-blueHover transition">
            Login Sekarang
          </Link>
        </div>
      );
    }
    if (status === 402) {
      const paymentMethods = getPaymentMethods();
      return (
        <div className="bg-tv-card border border-tv-border rounded-xl p-8 text-center">
          <Crown className="w-8 h-8 mx-auto mb-3 text-tv-gold" />
          <p className="text-white font-semibold mb-1">LensAI adalah fitur Pro</p>
          <p className="text-tv-muted text-sm mb-4">Upgrade ke SahamLens Pro untuk melihat rapat lengkap LensAI pada {symbol}.</p>
          {paymentMethods.length > 0 && (
            <div className="text-left max-w-xs mx-auto mb-4 space-y-1">
              {paymentMethods.map((m) => (
                <p key={m.id} className="text-xs text-tv-muted">
                  <span className="font-bold text-tv-text">{m.label}</span>: {m.accountNumber} (a.n. {m.accountName})
                </p>
              ))}
            </div>
          )}
          <a
            href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Halo, saya sudah transfer untuk upgrade ke SahamLens Pro (Rp99.000/bulan). Ini bukti transfernya.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-tv-gold px-5 py-2.5 text-sm font-bold text-tv-bg hover:opacity-90 transition"
          >
            Kirim Bukti Transfer via WhatsApp
          </a>
        </div>
      );
    }
    return (
      <div className="bg-tv-card border border-tv-border rounded-xl">
        {/* Pesan lama satu baris tanpa jalan keluar. Halaman ini Server Component,
            jadi "coba lagi" = memuat ulang rutenya; tautannya disediakan eksplisit
            alih-alih membiarkan pengguna menebak. */}
        <EmptyState
          illustration="empty"
          title={`Analisis LensAI untuk ${symbol} gagal dimuat`}
          description="Analisis 10 agen tidak berhasil diambil dari server. Grafik dan indikator di atas tetap bisa dipakai - keduanya tidak bergantung pada layanan ini."
        />
        <div className="pb-8 text-center">
          <Link
            href={`/technical/${symbol}`}
            className="inline-flex items-center gap-2 rounded-full border border-tv-border bg-tv-hover px-5 py-2 text-sm font-semibold text-tv-text transition-colors hover:border-tv-borderLight"
          >
            Muat ulang halaman
          </Link>
        </div>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-white font-bold">Rekomendasi LensAI</h2>
          <TechnicalExportSection
            symbol={symbol}
            finalSuggestion={council.final_suggestion}
            summaryId={council.summary_id}
            buyPct={buyPct}
            sellPct={sellPct}
            holdPct={holdPct}
            waitPct={waitPct}
            agents={agents}
            score={typeof council.score === 'number' ? council.score : null}
          />
        </div>

        {total > 0 && (
          <div className="mb-6">
            {/* blue-500 mentah diganti tv-blue - biru HOLD sebelumnya berbeda dari
                biru aksen di seluruh aplikasi. */}
            <div
              className="flex w-full h-3 rounded-full overflow-hidden mb-3 bg-tv-border"
              role="img"
              aria-label={`Suara agen: ${buyPct}% beli, ${holdPct}% tahan, ${waitPct}% tunggu, ${sellPct}% jual`}
            >
              {buyPct > 0 && <div style={{width: `${buyPct}%`}} className="bg-tv-green transition-[width] duration-1000 ease-settle"></div>}
              {holdPct > 0 && <div style={{width: `${holdPct}%`}} className="bg-tv-blue transition-[width] duration-1000 ease-settle"></div>}
              {waitPct > 0 && <div style={{width: `${waitPct}%`}} className="bg-tv-yellow transition-[width] duration-1000 ease-settle"></div>}
              {sellPct > 0 && <div style={{width: `${sellPct}%`}} className="bg-tv-red transition-[width] duration-1000 ease-settle"></div>}
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-number font-bold">
              {buyPct > 0 && <span className="text-tv-green">{buyPct}% BUY</span>}
              {holdPct > 0 && <span className="text-tv-blue">{holdPct}% HOLD</span>}
              {waitPct > 0 && <span className="text-tv-yellow">{waitPct}% WAIT</span>}
              {sellPct > 0 && <span className="text-tv-red">{sellPct}% SELL</span>}
            </div>

            {/* Storytelling: batang di atas menunjukkan sebaran suara, tapi tidak
                pernah menyebut hal yang paling penting - seberapa BULAT kesepakatannya.
                Sepuluh agen yang sepakat dan sepuluh agen yang terbelah 5-5 menghasilkan
                satu "Rekomendasi LensAI" yang terlihat sama meyakinkannya. */}
            {(() => {
              const tallies = [
                { label: 'BUY', pct: buyPct },
                { label: 'HOLD', pct: holdPct },
                { label: 'WAIT', pct: waitPct },
                { label: 'SELL', pct: sellPct },
              ].sort((a, b) => b.pct - a.pct);
              const top = tallies[0];
              const dissent = 100 - top.pct;
              const agree = Math.round((top.pct / 100) * total);

              const note =
                top.pct >= 80 ? `Kesepakatan kuat: ${agree} dari ${total} agen memilih ${top.label}.`
                : top.pct >= 60 ? `Mayoritas memilih ${top.label} (${agree} dari ${total} agen), tapi ${dissent}% suara tidak setuju - baca alasan agen yang berbeda pendapat di bawah.`
                : `Suara terpecah: tidak ada pilihan yang mencapai 60%. "${council.final_suggestion}" di bawah adalah suara terbanyak, bukan kesepakatan - perlakukan sebagai bahan pertimbangan, bukan kesimpulan.`;

              return <p className="mt-3 text-[11px] leading-relaxed text-tv-muted">{note}</p>;
            })()}
          </div>
        )}

        <div className="mt-4 p-4 bg-tv-hover rounded-lg border border-tv-borderLight">
          {/* BUG FIX (audit BUILD 003 2026-08-03): "Confidence: X%" DIHAPUS - angka itu
              dikarang bebas oleh LLM tanpa formula (lihat council.service.ts), bukan
              dihitung dari data. Persentase BUY/SELL/HOLD/WAIT di atas TETAP tampil -
              itu vote riil dari signal 10 agent, bukan angka karangan. */}
          {/* BUG FIX (2026-08-06): span ini dulu selalu text-tv-green, apa pun isi
              final_suggestion. Saran SELL / HINDARI / WAIT dirender HIJAU - warna
              yang membawa arti berlawanan dari kalimatnya sendiri. Warna sekarang
              mengikuti isi saran, dan jatuh ke netral kalau tidak dikenali. */}
          <p className="text-lg text-white mb-2">
            Kesimpulan:{' '}
            <span className={(() => {
              const s = String(council.final_suggestion || '').toUpperCase();
              if (s.includes('SELL') || s.includes('JUAL') || s.includes('HINDARI')) return 'font-semibold text-tv-red';
              if (s.includes('BUY') || s.includes('BELI')) return 'font-semibold text-tv-green';
              if (s.includes('WAIT') || s.includes('TUNGGU') || s.includes('HOLD') || s.includes('TAHAN')) return 'font-semibold text-tv-yellow';
              return 'font-semibold text-tv-text';
            })()}>
              {council.final_suggestion}
            </span>
          </p>
          {/* whitespace-pre-line: summary_id dari Gemini saat ini satu kalimat padat
              tanpa newline by design, tapi HTML mengciutkan \n jadi spasi tunggal secara
              default - kalau prompt berubah atau model sesekali mengembalikan newline,
              ini mencegahnya berubah jadi satu paragraf raksasa tanpa jeda. */}
          <p className="text-sm text-tv-muted leading-relaxed whitespace-pre-line">{council.summary_id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent: any, idx: number) => {
          const isBuy = agent.signal === 'BUY';
          const isSell = agent.signal === 'SELL';
          const isWait = agent.signal === 'WAIT';
          
          return (
            <div key={idx} className="bg-tv-hover border border-tv-border rounded-lg p-4 transition-colors hover:border-tv-borderLight">
              <div className="flex justify-between items-center gap-2 mb-2">
                <h3 className="font-heading font-bold text-white text-sm flex items-center gap-2">
                  {agent.name}
                </h3>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-number font-semibold ${
                  isBuy ? 'bg-tv-green/20 text-tv-green border border-tv-green/30' :
                  isSell ? 'bg-tv-red/20 text-tv-red border border-tv-red/30' :
                  isWait ? 'bg-tv-yellow/20 text-tv-yellow border border-tv-yellow/30' :
                  'bg-tv-border text-tv-muted'
                }`}>
                  {agent.signal}
                </span>
              </div>
              <p className="text-sm text-tv-muted whitespace-pre-line">{agent.reason}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LensAIAnalysisSkeleton({ symbol }: { symbol: string }) {
  return (
    // Kerangka mengikuti bentuk hasil aslinya (batang suara + kartu agen), bukan
    // kotak-kotak kosong berdenyut yang tidak menyerupai apa pun. Tunggu 5-10 detik
    // itu lama - LoadingFact mengisi jeda itu dengan sesuatu yang berguna.
    <div className="space-y-6">
      <div className="bg-tv-card border border-tv-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" className="w-32 h-4" />
          <Skeleton variant="text" className="w-20 h-4" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <Skeleton className="h-16 w-full" />
        <p className="text-center text-xs text-tv-muted">
          LensAI sedang merapatkan {symbol} - biasanya 5-10 detik.
        </p>
        <LoadingFact />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

export default async function TechnicalPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <ClientHeader symbol={symbol} />
      
      {/* max-w-[1600px] menyamakan lebar dengan Technical/Fundamental (sebelumnya
          max-w-7xl = 1280px). */}
      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        <div className="flex items-center gap-3 mb-8">
          {/* Ikon Users generik (identik untuk semua emiten) diganti avatar per-emiten. */}
          <TickerAvatar symbol={symbol} size="lg" />
          <div>
            <h1 className="font-heading font-bold text-2xl text-white tracking-tight">LensAI: {symbol}</h1>
            <p className="text-sm text-tv-muted">Rapat 10 agen analisis atas satu emiten</p>
          </div>
        </div>

        <StockChartPanel symbol={symbol} />

        <Suspense fallback={<Skeleton className="h-40 w-full rounded-xl" />}>
          <OrchestratorRecommendation symbol={symbol} />
        </Suspense>

        <Suspense fallback={<LensAIAnalysisSkeleton symbol={symbol} />}>
          <LensAIAnalysisDisplay symbol={symbol} />
        </Suspense>
      </PageContainer>
    </div>
  );
}


