/**
 * "Yang penting dari [ticker]" (PRD §17): tiga sampai lima temuan, masing-masing dengan
 * buktinya sendiri.
 *
 * Sumbernya `consensusData.dimensions` - bukan kalimat baru yang dikarang di UI. Tiap
 * dimensi sudah membawa arah, bobot, dan nama analyzer yang memilihnya, jadi setiap
 * baris di sini bisa ditelusuri ke kartu analyzer di bawahnya. Tidak ada model bahasa
 * dan tidak ada request tambahan.
 *
 * Dimensi tanpa satu pun analyzer berarah DIBUANG, bukan ditulis "netral": nol vote
 * berarti tidak ada yang bisa dikatakan, dan itu berbeda dari "analyzernya bertentangan".
 *
 * Bahasa sengaja deskriptif ("momentum menguat"), bukan preskriptif ("pasti naik") -
 * model ini belum lolos validasi backtest out-of-sample.
 */
const DIMENSION_COPY: Record<string, { naik: string; turun: string; netral: string }> = {
  TREND: { naik: 'Tren menguat', turun: 'Tren melemah', netral: 'Tren belum satu arah' },
  MOMENTUM: { naik: 'Momentum membaik', turun: 'Momentum menurun', netral: 'Momentum campuran' },
  FLOW: { naik: 'Tekanan beli meningkat', turun: 'Tekanan jual meningkat', netral: 'Arus dana seimbang' },
  STRUCTURE: { naik: 'Struktur harga mendukung', turun: 'Struktur harga menekan', netral: 'Struktur harga netral' },
  VOLATILITY: { naik: 'Volatilitas mereda', turun: 'Volatilitas meningkat', netral: 'Volatilitas stabil' },
};

export interface TemuanDimensi {
  arah: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  judul: string;
  bukti: string;
}

export function susunTemuanDimensi(dimensi: any[]): TemuanDimensi[] {
  return dimensi
    .filter((d) => typeof d?.votedAnalyzers === 'number' && d.votedAnalyzers > 0)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, 5)
    .map((d) => {
      const copy = DIMENSION_COPY[d.dimension] ?? {
        naik: `${d.dimension} positif`,
        turun: `${d.dimension} negatif`,
        netral: `${d.dimension} netral`,
      };
      const arah: TemuanDimensi['arah'] = d.direction === 'BULLISH' ? 'BULLISH' : d.direction === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
      const daftarAnalyzer: string[] = Array.isArray(d.analyzers) ? d.analyzers.filter((label: unknown) => typeof label === 'string') : [];
      const dariAnalyzer = daftarAnalyzer.length > 0 ? `Dari ${daftarAnalyzer.slice(0, 4).join(', ')}.` : '';
      return {
        arah,
        judul: arah === 'BULLISH' ? copy.naik : arah === 'BEARISH' ? copy.turun : copy.netral,
        bukti: `${dariAnalyzer} ${d.votedAnalyzers} analyzer berarah, bobot dimensi ${d.weight}%.`.trim(),
      };
    });
}
