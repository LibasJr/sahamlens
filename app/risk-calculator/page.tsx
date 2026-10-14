'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert, Calculator, RefreshCw, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { Button, Input, PageContainer, EmptyState, AnimatedNumber, Skeleton } from '@/components/ui';
import { useLanguage } from '@/lib/i18n';
import { Card } from '@/components/ui/Card';
import { apiRequest } from '@/shared/http/api-client';
import MenuUsageGuide from '@/components/MenuUsageGuide';

function RiskCalculatorContent() {
  const { language } = useLanguage();
  const isEn = language === 'en';
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
      const json = await apiRequest<any>(`/api/live/${code}`);
      if (typeof json?.price !== 'number' || !Number.isFinite(json.price)) {
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
  const targetBelowEntry = rewardPerShare != null && rewardPerShare <= 0;

  const boundByCapital = hasValidInput && maxLotByCapital < maxLotByRisk;

  const consecutiveLossesSurvivable = maxLossRp > 0 ? Math.floor(modalNum / maxLossRp) : null;
  const breakevenWinRatePct = riskRewardRatio != null && riskRewardRatio > 0
    ? (1 / (1 + riskRewardRatio)) * 100
    : null;

  const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        <MenuUsageGuide
          menuKey="risk-calculator"
          whatItAnswers="Berapa lot yang boleh dibeli supaya kerugiannya masih terkendali?"
          steps={[
            "Isi modal, harga masuk, dan level stop loss Anda.",
            "Tentukan berapa persen modal yang siap dirisikokan pada satu transaksi.",
            "Hasilnya ukuran posisi maksimal dan rasio imbal-risikonya.",
          ]}
        />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-tv-red/10 border border-tv-red/30 flex items-center justify-center text-tv-red shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="lens-page-title">Risk Calculator</h1>
            <p className="text-tv-muted text-sm">Hitung ukuran posisi & rasio risk/reward sebelum entry - murni matematika dari input Anda.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Form */}
          <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-5 shadow-1 space-y-4">
            <h3 className="font-heading text-sm font-bold text-white flex items-center gap-2 border-b border-tv-border pb-3">
              <Calculator className="w-4 h-4 text-tv-blue" />
              Parameter Trade
            </h3>

            <div>
              <label className="lens-label">Simbol Saham</label>
              <div className="flex gap-2 mt-1">
                <SymbolAutocomplete
                  containerClassName="relative flex-1"
                  value={symbol}
                  onChange={(val) => setSymbol(val)}
                  placeholder="Simbol (contoh: BBCA)"
                  className="w-full bg-tv-bg border border-tv-border text-white rounded-lg px-3 py-2 text-sm font-number focus:outline-none focus:border-tv-blue"
                />
                <Button variant="bare" size="none"
                  onClick={fetchLivePrice}
                  disabled={loadingPrice}
                  className="shrink-0 px-3 py-2 rounded-lg bg-tv-hover border border-tv-border text-tv-text text-xs font-bold flex items-center gap-1.5 hover:bg-tv-border transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPrice ? 'animate-spin' : ''}`} />
                  Ambil Harga Live
                </Button>
              </div>
              {priceError && (
                <p className="mt-1.5 flex items-start gap-1.5 lens-caption">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  {priceError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Modal (Rp)"
                  type="number"
                  size="sm"
                  value={modal}
                  onChange={(e) => setModal(e.target.value)}
                  className="font-number"
                />
              </div>
              <div>
                <label htmlFor="risk-pct-input" className="lens-label">
                  {isEn ? 'Risk Per Trade (%)' : 'Risiko per Trade (%)'}
                </label>
                <div className="flex gap-1.5 mt-1">
                  <input
                    id="risk-pct-input"
                    type="number"
                    value={riskPct}
                    onChange={(e) => setRiskPct(e.target.value)}
                    className="w-full bg-tv-bg border border-tv-border text-white rounded-lg px-3 py-2 text-sm font-number focus:outline-none focus:border-tv-blue"
                  />
                  <Button variant="bare" size="none"
                    type="button"
                    onClick={() => setRiskPct('1')}
                    className={`px-2 py-1 rounded lens-label border transition-colors ${
                      riskPct === '1' ? 'bg-tv-green/20 border-tv-green text-tv-green' : 'bg-tv-bg border-tv-border text-tv-muted'
                    }`}
                  >
                    1%
                  </Button>
                  <Button variant="bare" size="none"
                    type="button"
                    onClick={() => setRiskPct('2')}
                    className={`px-2 py-1 rounded lens-label border transition-colors ${
                      riskPct === '2' ? 'bg-tv-blue/20 border-tv-blue text-tv-blue' : 'bg-tv-bg border-tv-border text-tv-muted'
                    }`}
                  >
                    2%
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Input
                  label="Harga Entry"
                  type="number"
                  size="sm"
                  min="0"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  placeholder="0"
                  className="font-number"
                />
              </div>
              <div>
                <Input
                  label="Stop Loss"
                  type="number"
                  size="sm"
                  min="0"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="0"
                  className="font-number"
                />
              </div>
              <div>
                <Input
                  label="Target (opsional)"
                  type="number"
                  size="sm"
                  min="0"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="0"
                  className="font-number"
                />
              </div>
            </div>

            {!hasValidInput && (entryNum > 0 || stopLossNum > 0) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-tv-yellow/10 border border-tv-yellow/30 text-tv-yellow text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Harga Stop Loss harus lebih rendah dari Harga Entry, dan Modal/Entry harus diisi.</span>
              </div>
            )}
          </Card>

          {/* Result */}
          <Card padding="none" radius="xl" elevation="none" highlight={false} overflow="visible" className="border-tv-border p-5 shadow-1 space-y-4">
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
                    <div className="lens-caption">Ukuran Posisi Maksimal</div>
                    <div className="text-xl font-bold text-white font-number mt-1">
                      <AnimatedNumber value={finalLot} format={(n) => Math.round(n).toLocaleString('id-ID')} /> lot
                    </div>
                    <div className="lens-caption">{finalShares.toLocaleString('id-ID')} lembar</div>
                  </div>
                  <div className="p-3 rounded-lg bg-tv-bg border border-tv-border">
                    <div className="lens-caption">Modal Dibutuhkan</div>
                    <div className="text-xl font-bold text-white font-number mt-1">
                      <AnimatedNumber value={capitalNeeded} format={fmtRp} />
                    </div>
                    <div className="lens-caption">dari {fmtRp(modalNum)} tersedia</div>
                  </div>
                </div>

                {boundByCapital && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-tv-blue/10 border border-tv-blue/30 text-tv-blue text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Ukuran posisi dibatasi oleh MODAL (bukan budget risiko) - modal Anda tidak cukup untuk mencapai lot maksimal sesuai risk budget.</span>
                  </div>
                )}

                <div className="p-4 rounded-lg bg-tv-red/10 border border-tv-red/30">
                  <div className="flex items-center gap-1.5 lens-eyebrow text-tv-red">
                    <TrendingDown className="w-3.5 h-3.5" /> Jika Kena Stop Loss
                  </div>
                  <div className="text-lg font-bold text-tv-red font-number mt-1">-{fmtRp(maxLossRp)} ({maxLossPct.toFixed(2)}% dari modal)</div>
                  {consecutiveLossesSurvivable != null && consecutiveLossesSurvivable > 0 && (
                    <p className="mt-1.5 lens-body-sm">
                      Pada ukuran ini, modal habis setelah{' '}
                      <span className="font-number font-semibold text-tv-red">{consecutiveLossesSurvivable}</span> kali kalah beruntun.
                      {consecutiveLossesSurvivable < 10 && ' Rentetan kalah 5-10 kali adalah hal biasa, bahkan pada strategi yang menguntungkan.'}
                    </p>
                  )}
                </div>

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
                    <div className="flex items-center gap-1.5 lens-eyebrow text-tv-green">
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
                      <span className="lens-label">Risk/Reward Ratio</span>
                      <span className={`lens-label font-number ${riskRewardRatio >= 2 ? 'text-tv-green' : riskRewardRatio >= 1 ? 'text-tv-yellow' : 'text-tv-red'}`}>
                        1 : {riskRewardRatio.toFixed(2)}
                      </span>
                    </div>
                    {breakevenWinRatePct != null && (
                      <p className="mt-2 pt-2 border-t border-tv-border lens-body-sm">
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
          </Card>
        </div>
      </PageContainer>
    </div>
  );
}

function RiskCalculatorSuspenseFallback() {
  return (
    <div className="flex-1 flex flex-col bg-tv-bg min-h-screen">
      <PageContainer className="p-4 md:p-6 lg:p-7 space-y-6">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </PageContainer>
    </div>
  );
}

export default function RiskCalculatorPage() {
  return (
    <Suspense fallback={<RiskCalculatorSuspenseFallback />}>
      <RiskCalculatorContent />
    </Suspense>
  );
}
