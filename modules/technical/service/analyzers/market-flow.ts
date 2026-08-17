import { isIdxMarketHoursNow, todayDateKeyWIB } from '@/shared/market/trading-session';

// BUG FIX (audit integritas data 2026-08-03, temuan L-04): fungsi ini SEBELUMNYA
// mengembalikan 3 nama berbeda untuk indikator yang SAMA ('Market Flow (Accum/Dist)',
// 'Market Flow (A/D)', 'Accumulation / Distribution') tergantung cabang mana yang
// dieksekusi - padahal indikator ini secara konsisten disebut 'Market Flow Index' di
// tempat lain (modules/backtest/types/backtest.types.ts, precompute.service.ts,
// app/backtest/page.tsx). Satu nama dipakai di ketiga cabang di bawah supaya konsumen
// (kartu UI, prompt AI) tidak menampilkan 3 label berbeda untuk indikator yang sama.
const LABEL = 'Market Flow Index (Accum/Dist)';

export function analyze(history: any[], currentPrice: number) {
  const last = history[history.length - 1];
  const lastDate = typeof last?.Date === 'string' ? last.Date.split('T')[0] : null;
  if (lastDate === todayDateKeyWIB() && isIdxMarketHoursNow()) {
    return { label: LABEL, value: 'N/A (INTRADAY_VOLUME_PARTIAL)', decision: 'NEUTRAL', confidence: 0 };
  }
  if (history.length < 15) return { label: LABEL, value: 'N/A', decision: 'NEUTRAL', confidence: 0 };
  if (history.some((h) =>
    typeof h.AdjClose !== 'number' || !Number.isFinite(h.AdjClose) || h.AdjClose <= 0 ||
    typeof h.Volume !== 'number' || !Number.isFinite(h.Volume) || h.Volume < 0
  )) {
    return { label: LABEL, value: 'N/A (MISSING_ADJUSTED_PRICE)', decision: 'NEUTRAL', confidence: 0 };
  }

  let accum = 0;
  let dist = 0;

  // FASE 3: arah harian memakai adjusted close eksplisit. Missing adjusted price sudah
  // ditolak di atas; tidak ada fallback ke raw Close.
  for (let i = history.length - 14; i < history.length; i++) {
    const change = history[i].AdjClose - history[i - 1].AdjClose;
    if (change > 0) {
      accum += history[i].Volume;
    } else if (change < 0) {
      dist += history[i].Volume;
    }
  }

  let decision = 'NEUTRAL';
  let confidence = 50;

  const total = accum + dist;
  // Tidak ada volume valid = data tidak tersedia. Confidence 50 dulu terlihat seperti
  // keyakinan model netral padahal tidak ada observasi; gunakan 0 agar fail-closed.
  if (total === 0) return { label: LABEL, value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const accumPct = (accum / total) * 100;

  if (accumPct > 55) {
    decision = 'BULLISH';
    confidence = Math.min(95, accumPct);
  } else if (accumPct < 45) {
    decision = 'BEARISH';
    confidence = Math.min(95, 100 - accumPct);
  }

  return {
    label: LABEL,
    value: `Accum: ${accumPct.toFixed(1)}%, Dist: ${(100-accumPct).toFixed(1)}%`,
    decision,
    confidence: Math.round(confidence)
  };
}
