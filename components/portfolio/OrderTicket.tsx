'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import SymbolAutocomplete from '@/components/SymbolAutocomplete';
import { tickerLabel } from '@/lib/utils/ticker-label';
import { Button, Card } from '@/components/ui';
import { useModalBehavior } from '@/lib/hooks/useModalBehavior';
import { apiErrorMessage, apiRequest } from '@/shared/http/api-client';
import {
  maxExecutableLots,
  orderValue as computeOrderValue,
  roundToTick,
  stepPrice as stepPriceBy,
  validateOrderDraft,
} from '@/modules/portfolio/utils/order-ticket';

const formatIDR = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

export interface OrderTicketHolding {
  symbol: string;
  lots: number;
  avgPrice: number;
  currentPrice?: number;
}

interface OrderTicketProps {
  open: boolean;
  type: 'BUY' | 'SELL';
  onTypeChange: (type: 'BUY' | 'SELL') => void;
  cash: number;
  holdings: OrderTicketHolding[];
  initialSymbol?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Tiket order portofolio virtual.
 *
 * Bentuk lama meminta pengguna mengetik SENDIRI simbol, harga, dan lot ke tiga kotak
 * kosong tanpa satu pun angka acuan: tidak ada harga pasar, tidak ada sisa kas, tidak
 * ada jumlah lot yang dimiliki. Akibatnya order gampang ditolak server (harga
 * menyimpang >35% dari pasar, kas tidak cukup, lot melebihi kepemilikan) dan pesan
 * gagalnya baru muncul SETELAH dikirim. Tiket ini mengikuti pola aplikasi sekuritas:
 * pilih emiten -> harga terisi otomatis dari harga pasar terakhir -> lot diatur dengan
 * tombol/persentase, dengan nilai order dan sisa kas dihitung langsung di depan mata.
 */
export default function OrderTicket({ open, type, onTypeChange, cash, holdings, initialSymbol, onClose, onDone }: OrderTicketProps) {
  const [symbol, setSymbol] = useState('');
  const [price, setPrice] = useState('');
  const [lots, setLots] = useState('');
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceUnavailable, setPriceUnavailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const priceTouched = useRef(false);
  // Escape, Tab yang terkurung, kunci gulir latar, dan pengembalian fokus - satu
  // perilaku dialog yang sama dengan modal lain di aplikasi ini.
  const panelRef = useRef<HTMLElement>(null);
  useModalBehavior({ open, onClose, containerRef: panelRef });

  const reset = useCallback(() => {
    setSymbol('');
    setPrice('');
    setLots('');
    setMarketPrice(null);
    setPriceUnavailable(false);
    setServerError('');
    priceTouched.current = false;
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    if (initialSymbol) setSymbol(initialSymbol);
  }, [open, initialSymbol, reset]);


  // Harga pasar terakhir jadi titik awal harga order. Pengguna tetap boleh
  // menimpanya (mencatat entry di harga intraday lain), tapi tidak lagi WAJIB
  // menebak angka yang kebetulan lolos penjaga harga di server.
  useEffect(() => {
    const clean = symbol.trim().toUpperCase();
    if (!open || clean.length < 4) {
      setMarketPrice(null);
      setPriceUnavailable(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setPriceLoading(true);
    setPriceUnavailable(false);
    (async () => {
      try {
        const data = await apiRequest<{ stock?: { current_price?: number } }>(
          `/api/stock/${clean.includes('.') ? clean : `${clean}.JK`}`,
          { signal: controller.signal },
        );
        const p = data?.stock?.current_price;
        if (cancelled) return;
        if (typeof p === 'number' && Number.isFinite(p) && p > 0) {
          setMarketPrice(p);
          setPriceUnavailable(false);
          if (!priceTouched.current) setPrice(String(roundToTick(p)));
        } else {
          setMarketPrice(null);
          setPriceUnavailable(true);
        }
      } catch (e) {
        if (!cancelled && !(e instanceof DOMException && e.name === 'AbortError')) {
          setMarketPrice(null);
          setPriceUnavailable(true);
        }
      } finally {
        if (!cancelled) setPriceLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [symbol, open]);

  const priceNum = Number(price) || 0;
  const lotsNum = Number(lots) || 0;
  const orderValue = computeOrderValue(priceNum, lotsNum);

  const ownedLots = useMemo(() => {
    const clean = symbol.trim().toUpperCase();
    const withJK = clean.includes('.') ? clean : `${clean}.JK`;
    return holdings.find((h) => h.symbol.toUpperCase() === withJK)?.lots ?? 0;
  }, [holdings, symbol]);

  // Batas atas lot yang MASUK AKAL untuk order ini: kas yang benar-benar ada
  // (BUY) atau lot yang benar-benar dipegang (SELL). Dipakai tombol persentase
  // dan validasi, jadi angka "100%" selalu berarti sesuatu yang bisa dieksekusi.
  const maxLots = useMemo(
    () => maxExecutableLots({ type, cash, price: priceNum, ownedLots }),
    [type, cash, priceNum, ownedLots],
  );

  const validationError = useMemo(
    () => validateOrderDraft({
      type,
      symbol,
      price: priceNum,
      lots: lotsNum,
      cash,
      ownedLots,
      marketPrice,
      priceUnavailable,
    }),
    [type, symbol, priceNum, lotsNum, cash, ownedLots, marketPrice, priceUnavailable],
  );

  const canSubmit = !validationError && !submitting && !priceLoading;

  const stepPrice = (direction: 1 | -1) => {
    priceTouched.current = true;
    setPrice(String(stepPriceBy(priceNum > 0 ? priceNum : marketPrice || 0, direction)));
  };

  const stepLots = (direction: 1 | -1) => {
    setLots(String(Math.max(0, lotsNum + direction)));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError('');
    try {
      await apiRequest(type === 'BUY' ? '/api/portfolio/buy' : '/api/portfolio/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          price: priceNum,
          lots: lotsNum,
          note: `Manual ${type}`,
        }),
      });
      onDone(`${type} ${lotsNum} lot ${tickerLabel(symbol.toUpperCase())} @ ${priceNum.toLocaleString('id-ID')} tercatat.`);
      reset();
    } catch (error) {
      // Pesan server ditampilkan DI DALAM tiket, tepat di atas tombol konfirmasi -
      // toast yang lewat begitu saja membuat alasan penolakan hilang sebelum sempat
      // dibaca, dan itulah kenapa order yang gagal cuma terasa "tidak bisa" saja.
      setServerError(apiErrorMessage(error, 'Order gagal dikirim. Periksa koneksi lalu coba lagi.', true));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const accent = type === 'BUY' ? 'text-tv-green' : 'text-tv-red';
  const inputClass = 'w-full rounded-xl border border-white/[0.08] bg-black/15 px-3 py-2.5 text-center font-number text-base tabular-nums text-tv-text focus:border-tv-blue/65 focus:outline-none';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card
        ref={panelRef}
        as="div"
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${type === 'BUY' ? 'Beli' : 'Jual'}`}
        padding="none" radius="xl" elevation="none" overflow="visible" highlight={false}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border-tv-border p-5 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`font-heading text-lg font-bold ${accent}`}>Order Virtual</h2>
          <Button variant="bare" size="none" type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-tv-muted transition-colors hover:bg-tv-hover hover:text-white">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Beli/Jual jadi sakelar di dalam tiket - sebelumnya tipe order hanya bisa
            dipilih dari tombol di header, jadi salah pilih berarti tutup modal dan
            mengisi ulang semuanya dari nol. */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-black/20 p-1">
          {(['BUY', 'SELL'] as const).map((t) => (
            <Button
              key={t}
              variant="bare"
              size="none"
              type="button"
              onClick={() => onTypeChange(t)}
              className={`rounded-lg py-2 text-sm font-bold transition-colors ${
                type === t
                  ? t === 'BUY' ? 'bg-tv-green/15 text-tv-green' : 'bg-tv-red/15 text-tv-red'
                  : 'text-tv-muted hover:text-tv-text'
              }`}
            >
              {t === 'BUY' ? 'Beli' : 'Jual'}
            </Button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-tv-muted">Emiten</label>
            <SymbolAutocomplete
              value={symbol}
              onChange={(val) => { priceTouched.current = false; setSymbol(val); }}
              onSelect={(val) => { priceTouched.current = false; setSymbol(val); }}
              placeholder="Cari kode atau nama, mis. BBCA"
              className="w-full rounded-xl border border-white/[0.08] bg-black/15 px-3 py-2.5 font-number text-base text-tv-text focus:border-tv-blue/65 focus:outline-none"
            />
            <div className="mt-1.5 flex min-h-[18px] items-center justify-between text-[11px]">
              <span className="text-tv-muted">
                {priceLoading ? 'Mengambil harga pasar...' : marketPrice != null ? `Harga pasar terakhir ${marketPrice.toLocaleString('id-ID')}` : ''}
              </span>
              {type === 'SELL' && ownedLots > 0 && <span className="text-tv-muted">Dimiliki {ownedLots.toLocaleString('id-ID')} lot</span>}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-tv-muted">Harga</label>
            <div className="flex items-center gap-2">
              <Button variant="bare" size="none" type="button" onClick={() => stepPrice(-1)} aria-label="Turunkan harga" className="rounded-xl border border-tv-border p-2.5 text-tv-muted transition-colors hover:bg-tv-hover hover:text-white">
                <Minus className="h-4 w-4" />
              </Button>
              <input
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => { priceTouched.current = true; setPrice(e.target.value); }}
                className={inputClass}
                aria-label="Harga per saham"
              />
              <Button variant="bare" size="none" type="button" onClick={() => stepPrice(1)} aria-label="Naikkan harga" className="rounded-xl border border-tv-border p-2.5 text-tv-muted transition-colors hover:bg-tv-hover hover:text-white">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {marketPrice != null && (
              <Button
                variant="bare"
                size="none"
                type="button"
                onClick={() => { priceTouched.current = false; setPrice(String(roundToTick(marketPrice))); }}
                className="mt-1.5 text-[11px] font-semibold text-tv-blue hover:underline"
              >
                Pakai harga pasar
              </Button>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-semibold text-tv-muted">Lot</label>
              <span className="text-[11px] text-tv-muted">
                {type === 'BUY' ? `Maks ${maxLots.toLocaleString('id-ID')} lot dari kas` : `Maks ${ownedLots.toLocaleString('id-ID')} lot`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="bare" size="none" type="button" onClick={() => stepLots(-1)} aria-label="Kurangi lot" className="rounded-xl border border-tv-border p-2.5 text-tv-muted transition-colors hover:bg-tv-hover hover:text-white">
                <Minus className="h-4 w-4" />
              </Button>
              <input
                type="number"
                inputMode="numeric"
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                className={inputClass}
                aria-label="Jumlah lot"
              />
              <Button variant="bare" size="none" type="button" onClick={() => stepLots(1)} aria-label="Tambah lot" className="rounded-xl border border-tv-border p-2.5 text-tv-muted transition-colors hover:bg-tv-hover hover:text-white">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {[25, 50, 75, 100].map((pct) => (
                <Button
                  key={pct}
                  variant="bare"
                  size="none"
                  type="button"
                  disabled={maxLots <= 0}
                  onClick={() => setLots(String(Math.max(1, Math.floor((maxLots * pct) / 100))))}
                  className="rounded-lg border border-tv-border py-1.5 text-[11px] font-bold text-tv-muted transition-colors hover:bg-tv-hover hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pct}%
                </Button>
              ))}
            </div>
          </div>

          {/* Ringkasan uang: nilai order dan sisa kas dihitung langsung supaya
              keputusan diambil dengan angka yang terlihat, bukan dikira-kira. */}
          <div className="space-y-1.5 rounded-xl border border-tv-border bg-black/15 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-tv-muted">Nilai order</span>
              <span className="font-number font-bold tabular-nums text-white">{formatIDR(orderValue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-tv-muted">{type === 'BUY' ? 'Kas setelah order' : 'Kas setelah jual'}</span>
              <span className="font-number tabular-nums text-tv-text">
                {formatIDR(type === 'BUY' ? cash - orderValue : cash + orderValue)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-tv-muted">Kas tersedia</span>
              <span className="font-number tabular-nums text-tv-text">{formatIDR(cash)}</span>
            </div>
          </div>

          {(serverError || (validationError && (symbol.trim() !== '' || lotsNum > 0))) && (
            <p className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${serverError ? 'border-tv-red/30 bg-tv-red/10 text-tv-red' : 'border-tv-warning/30 bg-tv-warning/10 text-tv-warning'}`}>
              {serverError || validationError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Batal</Button>
            <Button type="submit" variant={type === 'BUY' ? 'primary' : 'danger'} loading={submitting} disabled={!canSubmit} className="flex-1">
              {submitting ? 'Memproses...' : type === 'BUY' ? 'Beli' : 'Jual'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
