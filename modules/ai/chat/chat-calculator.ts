/**
 * Kalkulator deterministik LensAI untuk pertanyaan yang angkanya sudah diberikan
 * pengguna. Ini sengaja tidak memakai model bahasa: lot, risiko, compounding, dan MoS
 * adalah aritmetika yang harus dapat diaudit dan selalu menghasilkan angka yang sama.
 */

type CalculatorResult = { content: string; kind: 'POSITION_SIZE' | 'LOTS' | 'COMPOUNDING' | 'MARGIN_OF_SAFETY' };

function parseIdNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const compact = raw.toLowerCase().replace(/rp\.?\s*/g, '').replace(/\s+/g, '');
  const multiplier = /(?:juta|jt)$/.test(compact) ? 1_000_000
    : /(?:miliar|m)$/.test(compact) ? 1_000_000_000
      : /(?:ribu|rb|k)$/.test(compact) ? 1_000
        : 1;
  const numeric = compact.replace(/(?:juta|jt|miliar|m|ribu|rb|k)$/g, '');
  if (!numeric || !/^[0-9.,]+$/.test(numeric)) return null;

  const lastComma = numeric.lastIndexOf(',');
  const lastDot = numeric.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalAt = Math.max(lastComma, lastDot);
    const decimal = numeric.slice(decimalAt + 1);
    normalized = decimal.length <= 2
      ? `${numeric.slice(0, decimalAt).replace(/[.,]/g, '')}.${decimal}`
      : numeric.replace(/[.,]/g, '');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? ',' : '.';
    const parts = numeric.split(separator);
    const last = parts[parts.length - 1];
    normalized = parts.length === 2 && last.length <= 2
      ? `${parts[0]}.${last}`
      : parts.join('');
  } else {
    normalized = numeric;
  }
  const value = Number(normalized) * multiplier;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function amountAfter(text: string, label: string): number | null {
  const match = text.match(new RegExp(`(?:${label})\\s*(?:=|:|sekitar|sebesar|di)?\\s*(rp\\.?\\s*)?([0-9][0-9.,]*\\s*(?:juta|jt|miliar|ribu|rb|k)?)`, 'i'));
  return parseIdNumber(match ? `${match[1] ?? ''}${match[2]}` : undefined);
}

function percentAfter(text: string, label: string): number | null {
  const match = text.match(new RegExp(`(?:${label})\\s*(?:=|:|sekitar|sebesar|di)?\\s*([0-9]+(?:[.,][0-9]+)?)\\s*%`, 'i'));
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function rupiah(value: number): string {
  return `Rp${Math.round(value).toLocaleString('id-ID')}`;
}

function percent(value: number): string {
  return `${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
}

export function calculateChatQuestion(prompt: string): CalculatorResult | null {
  const text = prompt.toLowerCase();
  const capital = amountAfter(text, 'modal|dana|budget');
  const entry = amountAfter(text, 'entry|harga beli|beli di|harga');
  const stop = amountAfter(text, 'stop loss|stop|cut loss|cl');
  const target = amountAfter(text, 'target|take profit|tp');
  const riskPct = percentAfter(text, 'risiko|risk');
  const fairValue = amountAfter(text, 'nilai wajar|fair value|intrinsik');
  const years = amountAfter(text, 'tahun|selama');
  const returnPct = percentAfter(text, 'return|imbal hasil|yield|dividen');

  if (/\b(margin of safety|mos)\b/.test(text) && fairValue && entry) {
    const mos = ((fairValue - entry) / fairValue) * 100;
    return {
      kind: 'MARGIN_OF_SAFETY',
      content: `Margin of safety-nya **${percent(mos)}**.\n\nPerhitungan: (nilai wajar ${rupiah(fairValue)} − harga ${rupiah(entry)}) ÷ nilai wajar ${rupiah(fairValue)}.`,
    };
  }

  if (/\b(compound|compounding|majemuk|reinvestasi)\b/.test(text) && capital && returnPct && years) {
    const finalValue = capital * Math.pow(1 + returnPct / 100, years);
    return {
      kind: 'COMPOUNDING',
      content: `Dengan modal ${rupiah(capital)}, imbal hasil ${percent(returnPct)} per tahun selama ${years} tahun, nilai akhirnya sekitar **${rupiah(finalValue)}**.\n\nPerhitungan: modal × (1 + return)ⁿ. Ini simulasi dengan return tetap dan seluruh hasil direinvestasikan; tidak memasukkan pajak, biaya, atau perubahan harga.`,
    };
  }

  if (/\b(position size|ukuran posisi|risk reward|risk\/reward|r:r|risk per trade)\b/.test(text) && capital && riskPct && entry && stop && entry > stop) {
    const maxRisk = capital * riskPct / 100;
    const riskPerShare = entry - stop;
    const lots = Math.floor(maxRisk / riskPerShare / 100);
    const shares = lots * 100;
    const positionValue = shares * entry;
    const rewardPerShare = target && target > entry ? target - entry : null;
    const rr = rewardPerShare ? rewardPerShare / riskPerShare : null;
    return {
      kind: 'POSITION_SIZE',
      content: [
        `Ukuran posisi berdasarkan risiko: **${lots.toLocaleString('id-ID')} lot** (${shares.toLocaleString('id-ID')} saham), dengan nilai posisi sekitar **${rupiah(positionValue)}**.`,
        `Risiko maksimum: ${percent(riskPct)} × ${rupiah(capital)} = ${rupiah(maxRisk)}. Risiko per saham: ${rupiah(entry)} − ${rupiah(stop)} = ${rupiah(riskPerShare)}.`,
        rr ? `Risk/reward ke target ${rupiah(target!)}: **1:${rr.toLocaleString('id-ID', { maximumFractionDigits: 2 })}**.` : 'Tambahkan target/TP bila ingin menghitung risk/reward.',
      ].join('\n\n'),
    };
  }

  if (/\b(lot|berapa saham|bisa beli)\b/.test(text) && capital && entry) {
    const lots = Math.floor(capital / entry / 100);
    const spent = lots * 100 * entry;
    return {
      kind: 'LOTS',
      content: `Dengan modal ${rupiah(capital)} pada harga ${rupiah(entry)} per saham, kamu dapat membeli **${lots.toLocaleString('id-ID')} lot** (${(lots * 100).toLocaleString('id-ID')} saham). Nilai pembeliannya ${rupiah(spent)} sebelum biaya broker.`,
    };
  }

  return null;
}
