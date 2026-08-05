'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert, Calculator, RefreshCw, TrendingDown, TrendingUp, AlertTriangle, Menu } from 'lucide-react';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { PageContainer, EmptyState, AnimatedNumber } from '@/components/ui';

// Risk Calculator - murni kalkulator matematika dari input pengguna (position sizing +
// risk/reward), TIDAK ada angka yang dikarang/ditebak. Satu-satunya panggilan API adalah
// mengambil harga live buat prefill "Harga Entry" (opsional, boleh ditimpa manual).
// Ukuran posisi dibatasi oleh DUA hal sekaligus: budget risiko (modal x risk%) DAN modal
// yang tersedia - lot final adalah yang lebih kecil dari keduanya, supaya tidak pernah
// menyarankan posisi yang sebenarnya tidak terjangkau modal.
//
// BUG FIX (2026-08-01): symbol sebelumnya hardcode 'BBCA.JK' - buka Risk Calculator
// setelah analisis TLKM di halaman lain tetap mulai dari BBCA. Sekarang ikut pola yang
// sama dengan /compare, /dcf, /fundamental: ?symbol= di URL dulu, lalu localStorage
// 'last_searched_ticker' (dipakai bersama lintas halaman analisa), baru default BBCA.
function RiskCalculatorContent() {
  const searchParams = useSearchParams();
  const [symbol, setSymbolState] = useState('BBCA.JK');
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [modal, setModal] = useState('10000000');
  const [riskPct, setRiskPct] = useState('1');
  const [entry, setEntry] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');

  const setSymbol = (newSymbol: string) => {
    const formatted = newSymbol.includes('.JK') ? newSymbol : `${newSymbol}.JK`;
    setSymbolState(formatted);
    if (typeof window !== 'undefined') {
      localStorage.setItem('last_searched_ticker', formatted);
    }
  };

  useEffect(() => {
    const urlSymbol = searchParams.get('symbol');
    if (urlSymbol) {
      setSymbol(urlSymbol.toUpperCase());
      return;
    }
    const savedTicker = typeof window !== 'undefined' ? localStorage.getItem('last_searched_ticker') : null;
    if (savedTicker) {
      setSymbolState(savedTicker.includes('.JK') ? savedTicker : `${savedTicker}.JK`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLivePrice = async () => {
    if (!symbol) return;
    setLoadingPrice(true);
    setPriceError(null);
    try {
      const code = symbol.replace('.JK', '');
      const res = await fetch(`/api/live/${code}`);
      const json = await res.json();
      // BUG FIX (2026-08-06): kegagalan di sini sebelumnya hanya masuk console.
      // Pengguna menekan "Ambil Harga Live", tidak ada yang terjadi di layar, dan
      // tidak ada cara mengetahui apakah tombolnya rusak, simbolnya salah, atau
      // harganya memang tidak tersedia.
      if (!res.ok || typeof json?.price !== 'number' || !Number.isFinite(json.price)) {
        setPriceError(`Harga live ${code} tidak tersedia. Isi Harga Entry secara manual.`);
        return;
      }
      setEntry(String(json.price));
    } catch (e) {
      console.error('Failed to fetch live price', e);
      setPriceError('Gagal mengambil harga live. Periksa sambungan, atau isi Harga Entry manual.');
    } finally {
      setLoadingPrice(false);
    }
  };

  const modalNum = parseFloat(modal) || 0;
  const riskPctNum = parseFloat(riskPct) || 0;
  const entryNum = parseFloat(entry) || 0;
  const stopLossNum = parseFloat(stopLoss) || 0;
  const targetNum = parseFloat(target) || 0;

  const riskPerShare = entryNum - stopLossNum;
  const riskBudgetRp = modalNum * (riskPctNum / 100);
  const hasValidInput = entryNum > 0 && stopLossNum > 0 && riskPerShare > 0 && modalNum > 0;

  const maxLotByRisk = hasValidInput ? Math.floor(riskBudgetRp / (riskPerShare * 100)) : 0;
  const maxLotByCapital = hasValidInput ? Math.floor(modalNum / (entryNum * 100)) : 0;
  const finalLot = Math.max(0, Math.min(maxLotByRisk, maxLotByCapital));
  const finalShares = finalLot * 100;
  const capitalNeeded = finalShares * entryNum;
  const maxLossRp = finalShares * riskPerShare;
  const maxLossPct = modalNum > 0 ? (maxLossRp / modalNum) * 100 : 0;

  const rewardPerShare = targetNum > 0 ? targetNum - entryNum : null;
  const potentialProfitRp = rewardPerShare != null ? finalShares * rewardPerShare : null;
  const riskRewardRatio = rewardPerShare != null && riskPerShare > 0 ? rewardPerShare / riskPerShare : null;
  // Target di BAWAH harga entry menghasilkan reward negatif. Sebelumnya keadaan ini
  // tetap dirender di kotak hijau berjudul "Jika Kena Target" - sebuah kerugian yang
  // dibingkai sebagai keuntungan.
  const targetBelowEntry = rewardPerShare != null && rewardPerShare <= 0;

  const boundByCapital = hasValidInput && maxLotByCapital < maxLotByRisk;

  // Berapa kali kalah beruntun yang masih bisa ditanggung modal pada ukuran risiko ini.
  // Pakai kerugian NYATA per trade (maxLossRp), bukan budget risiko teoretis, karena
  // pembulatan ke lot penuh membuat keduanya sering berbeda.
  const consecutiveLossesSurvivable = maxLossRp > 0 ? Math.floor(modalNum / maxLossRp) : null;
  // Titik impas: dengan rasio R, persentase kemenangan minimum agar tidak rugi adalah
  // 1 / (1 + R). Ini aritmetika ekspektasi, bukan prediksi.
  const breakevenWinRatePct = riskRewardRatio != null && riskRewardRatio > 0
    ? (1 / (1 + riskRewardRatio)) * 100
    : null;

  const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <PageContainer className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
            className="md:hidden p-2 -ml-2 text-tv-muted hover:text-white rounded-lg hover:bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          {/* red-500/red-400 mentah diganti tv-red - satu-satunya merah di halaman ini
              yang berbeda dari merah palet yang dipakai kotak kerugian di bawahnya. */}
          <div className="w-10 h-10 rounded-lg bg-tv-red/10 border border-tv-red/30 flex items-center justify-center text-tv-red shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-2xl text-white tracking-tight">Risk Calculator</h1>
            <p className="text-tv-muted text-sm">Hitung ukuran posisi & rasio risk/reward sebelum entry - murni matematika dari input Anda.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
            <h3 className="font-heading text-sm font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3">
              <Calculator className="w-4 h-4 text-tv-blue" />
              Parameter Trade
            </h3>

            <div>
              <label className="text-[11px] text-tv-muted uppercase tracking-wide">Simbol Saham</label>
              <div className="flex gap-2 mt-1">
                <SymbolAutocomplete
                  containerClassName="relative flex-1"
                  value={symbol}
                  onChange={(val) => setSymbol(val)}
                  placeholder="Simbol (contoh: BBCA)"
                  className="w-full bg-tv-bg border border-tv-border text-white rounded-lg px-3 py-2 text-sm font-number focus:outline-none focus:border-tv-blue"
                />
                <button
                  onClick={fetchLivePrice}
                  disabled={loadingPrice}
                  className="shrink-0 px-3 py-2 rounded-lg bg-tv-hover border border-tv-border text-tv-text text-xs font-bold flex items-center gap-1.5 hover:bg-tv-border transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPrice ? 'animate-spin' : ''}`} />
                  Ambil Harga Live
                </button>
              </div>
              {priceError && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-tv-yellow">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  {priceError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-tv-muted uppercase tracking-wide">Modal (Rp)</label>
                <input
                  type="number"
                  value={modal}
                  onChange={(e) => setModal(e.target.value)}
                  className="w-full mt-1 bg-tv-bg border border-tv-border text-white rounded-lg px-3 py-2 text-sm font-number focus:outline-none focus:border-tv-blue"
                />
              </div>
              <div>
                <label className="text-[11px] text-tv-muted uppercase tracking-wide">Risiko per Trade (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={riskPct}
                  onChange={(e) => setRiskPct(e.target.value)}
                  className="w-full mt-1 bg-tv-bg border border-tv-border text-white rounded-lg px-3 py-2 text-sm font-number focus:outline-none focus:border-tv-blue"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-tv-muted uppercase tracking-wide">Harga Entry</label>
                <input
                  type="number"
                  min="0"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  placeholder="0"
                  className="w-full mt-1 bg-tv-bg border border-tv-border text-white rounded-lg px-3 py-2 text-sm font-number focus:outline-none focus:border-tv-blue"
                />
              </div>
              <div>
                <label className="text-[11px] text-tv-muted uppercase tracking-wide">Stop Loss</label>
                <input
                  type="number"
                  min="0"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="0"
                  className="w-full mt-1 bg-tv-bg border border-tv-border text-white rounded-lg px-3 py-2 text-sm font-number focus:outline-none focus:border-tv-red"
                />
              </div>
              <div>
                <label className="text-[11px] text-tv-muted uppercase tracking-wide">Target (opsional)</label>
                <input
                  type="number"
                  min="0"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="0"
                  className="w-full mt-1 bg-tv-bg border border-tv-border text-white rounded-lg px-3 py-2 text-sm font-number focus:outline-none focus:border-tv-green"
                />
              </div>
            </div>

            {!hasValidInput && (entryNum > 0 || stopLossNum > 0) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-tv-yellow/10 border border-tv-yellow/30 text-tv-yellow text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Harga Stop Loss harus lebih rendah dari Harga Entry, dan Modal/Entry harus diisi.</span>
              </div>
            )}
          </div>

          {/* Result */}
          <div className="bg-tv-card border border-tv-border rounded-xl p-5 shadow-1 space-y-4">
            <h3 className="font-heading text-sm font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3">
              <ShieldAlert className="w-4 h-4 text-tv-red" />
              Hasil Perhitungan
            </h3>

            {!hasValidInput ? (
              <EmptyState
                illustration="collecting"
                title="Menunggu parameter trade"
                description="Isi Modal, Harga Entry, dan Stop Loss di sebelah kiri. Perhitungan di sini murni aritmetika dari angka yang kamu masukkan - tidak ada data pasar yang ikut menebak."
                progress={{
                  current: [modalNum > 0, entryNum > 0, stopLossNum > 0].filter(Boolean).length,
                  total: 3,
                  unit: 'kolom',
                  label: 'Kolom wajib terisi',
                }}
              />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-tv-bg border border-tv-border">
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide">Ukuran Posisi Maksimal</div>
                    <div className="text-xl font-bold text-white font-number mt-1">
                      <AnimatedNumber value={finalLot} format={(n) => Math.round(n).toLocaleString('id-ID')} /> lot
                    </div>
                    <div className="text-[10px] text-tv-muted mt-0.5">{finalShares.toLocaleString('id-ID')} lembar</div>
                  </div>
                  <div className="p-3 rounded-lg bg-tv-bg border border-tv-border">
                    <div className="text-[10px] text-tv-muted uppercase tracking-wide">Modal Dibutuhkan</div>
                    <div className="text-xl font-bold text-white font-number mt-1">
                      <AnimatedNumber value={capitalNeeded} format={fmtRp} />
                    </div>
                    <div className="text-[10px] text-tv-muted mt-0.5">dari {fmtRp(modalNum)} tersedia</div>
                  </div>
                </div>

                {boundByCapital && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-tv-blue/10 border border-tv-blue/30 text-tv-blue text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Ukuran posisi dibatasi oleh MODAL (bukan budget risiko) - modal Anda tidak cukup untuk mencapai lot maksimal sesuai risk budget.</span>
                  </div>
                )}

                <div className="p-4 rounded-lg bg-tv-red/10 border border-tv-red/30">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-tv-red">
                    <TrendingDown className="w-3.5 h-3.5" /> Jika Kena Stop Loss
                  </div>
                  <div className="text-lg font-bold text-tv-red font-number mt-1">-{fmtRp(maxLossRp)} ({maxLossPct.toFixed(2)}% dari modal)</div>
                  {consecutiveLossesSurvivable != null && consecutiveLossesSurvivable > 0 && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-tv-text/80">
                      Pada ukuran ini, modal habis setelah{' '}
                      <span className="font-number font-semibold text-tv-red">{consecutiveLossesSurvivable}</span> kali kalah beruntun.
                      {consecutiveLossesSurvivable < 10 && ' Rentetan kalah 5-10 kali adalah hal biasa, bahkan pada strategi yang menguntungkan.'}
                    </p>
                  )}
                </div>

                {/* Target di bawah entry: sebelumnya tetap dirender di kotak HIJAU
                    berjudul "Jika Kena Target" dengan angka negatif - kerugian yang
                    dibingkai sebagai keuntungan. */}
                {targetBelowEntry ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-tv-yellow/10 border border-tv-yellow/30 text-tv-yellow text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Harga Target ({fmtRp(targetNum)}) berada di bawah atau sama dengan Harga Entry ({fmtRp(entryNum)}).
                      Untuk posisi beli, target harus lebih tinggi dari entry - kalau tidak, &quot;target&quot; itu sendiri sudah merupakan kerugian.
                    </span>
                  </div>
                ) : rewardPerShare != null && (
                  <div className="p-4 rounded-lg bg-tv-green/10 border border-tv-green/30">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-tv-green">
                      <TrendingUp className="w-3.5 h-3.5" /> Jika Kena Target
                    </div>
                    <div className="text-lg font-bold text-tv-green font-number mt-1">
                      +{potentialProfitRp != null ? fmtRp(potentialProfitRp) : 'N/A'}
                    </div>
                  </div>
                )}

                {riskRewardRatio != null && riskRewardRatio > 0 && (
                  <div className="p-3 rounded-lg bg-tv-hover border border-tv-borderLight">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-tv-muted">Risk/Reward Ratio</span>
                      <span className={`text-sm font-bold font-number ${riskRewardRatio >= 2 ? 'text-tv-green' : riskRewardRatio >= 1 ? 'text-tv-yellow' : 'text-tv-red'}`}>
                        1 : {riskRewardRatio.toFixed(2)}
                      </span>
                    </div>
                    {/* Storytelling: rasio itu sendiri tidak memberi tahu apa pun sampai
                        diterjemahkan jadi syarat yang harus dipenuhi. */}
                    {breakevenWinRatePct != null && (
                      <p className="mt-2 pt-2 border-t border-tv-border text-[11px] leading-relaxed text-tv-muted">
                        Dengan rasio ini, kamu perlu menang minimal{' '}
                        <span className="font-number font-semibold text-tv-text">{breakevenWinRatePct.toFixed(0)}%</span>{' '}
                        dari seluruh trade hanya untuk impas - belum termasuk fee dan slippage.
                        {breakevenWinRatePct > 50 && ' Di atas 50% berarti kamu harus lebih sering benar daripada salah hanya untuk tidak rugi.'}
                        {breakevenWinRatePct <= 40 && ' Di bawah 40% berarti strategi ini masih untung meski lebih sering salah daripada benar.'}
                      </p>
                    )}
                  </div>
                )}

                {finalLot === 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-tv-yellow/10 border border-tv-yellow/30 text-tv-yellow text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Modal atau budget risiko terlalu kecil untuk 1 lot penuh (100 lembar) di harga ini.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}

export default function RiskCalculatorPage() {
  return (
    <Suspense fallback={null}>
      <RiskCalculatorContent />
    </Suspense>
  );
}
