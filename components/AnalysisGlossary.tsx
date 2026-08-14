'use client';

// BUG FIX (2026-08-14, masukan review eksternal - "tambahkan tooltip penjelasan
// indikator, user retail belum paham RSI/Quality/Growth/Leverage"): daftar SEBELUMNYA
// cuma 6 istilah (Bullish/Bearish/Netral/MA200/CMF/MOS) - tidak menyebut satu pun dari
// indikator TEKNIKAL (RSI, MACD, ATR, SMA/EMA, Momentum) atau PILAR FUNDAMENTAL
// (Quality/Growth/Leverage/Valuasi) yang justru paling sering muncul di kartu skor.
// Label di sini WAJIB sama persis dengan `label` yang dikembalikan analyzer
// (modules/technical/service/analyzers/*.ts, modules/fundamental/service/analyzers/*.ts)
// supaya istilah di kartu skor dan penjelasannya di sini tidak pernah berbeda kata.
const TERMS = [
  ['Bullish', 'indikator cenderung mendukung penguatan.'],
  ['Bearish', 'indikator cenderung menunjukkan pelemahan.'],
  ['Netral', 'belum ada arah yang cukup kuat.'],

  // Teknikal
  ['RSI 14', 'Relative Strength Index 14 hari - mengukur kecepatan & besaran pergerakan harga. Di atas 70 = jenuh beli (overbought, rawan koreksi), di bawah 30 = jenuh jual (oversold, rawan technical rebound). Bukan sinyal beli/jual otomatis, cuma satu dari beberapa indikator yang dipertimbangkan.'],
  ['MACD', 'Moving Average Convergence Divergence - selisih dua EMA (12 & 26 hari) dibanding garis sinyalnya (EMA 9 hari). MACD memotong ke atas garis sinyal = momentum menguat; memotong ke bawah = momentum melemah.'],
  ['MA200', 'rata-rata harga 200 hari untuk konteks tren jangka panjang.'],
  ['SMA / EMA', 'Simple/Exponential Moving Average - rata-rata harga berjalan. EMA memberi bobot lebih besar ke harga terbaru (lebih cepat bereaksi) dibanding SMA yang membobot rata semua hari sama.'],
  ['ATR (Volatilitas)', 'Average True Range - rata-rata rentang pergerakan harga harian. Dipakai model ini untuk menghitung proyeksi TP/CL (Take Profit/Cut Loss), BUKAN jaminan harga akan menyentuh level itu.'],
  ['Momentum', 'kecepatan perubahan harga dalam 1-5 hari terakhir - beda dari tren (arah jangka lebih panjang).'],
  ['Support & Resistance', 'level harga historis tempat harga cenderung berbalik arah - support (lantai) di bawah, resistance (atap) di atas. Berbasis data historis, bukan jaminan harga akan berhenti persis di situ.'],
  ['CMF', 'proxy tekanan beli/jual berbasis posisi harga dan volume; bukan broker flow resmi.'],

  // Fundamental - 3 pilar yang dinilai terpisah (Quality/Growth/Leverage), BUKAN
  // satu angka campur aduk - lihat modules/fundamental/service/consensus-labels.service.ts.
  ['Quality (Kualitas)', 'seberapa sehat & efisien bisnisnya SEKARANG - dilihat dari ROE (imbal hasil ekuitas), ROA (efisiensi aset), dan margin (gross/operating/net). Skor BAGUS/BURUK/NETRAL di kartu fundamental murni dari sisi ini, TERPISAH dari valuasi (murah/mahal).'],
  ['Growth (Pertumbuhan)', 'seberapa cepat pendapatan (Revenue Growth) dan laba per saham (EPS Growth) tumbuh dibanding periode sebelumnya.'],
  ['Leverage (Utang)', 'seberapa besar bisnis dibiayai utang - diukur dari Debt to Equity (DER), Current Ratio, dan Quick Ratio. Leverage tinggi = risiko lebih besar saat kondisi bisnis memburuk.'],
  ['ROE', 'Return on Equity - laba bersih dibanding ekuitas pemegang saham. Makin tinggi, makin efisien modal pemilik dipakai menghasilkan laba.'],
  ['DER', 'Debt to Equity Ratio - total utang dibanding ekuitas. DER tinggi bukan otomatis buruk (bank/sektor tertentu wajar DER tinggi), tapi perlu dibaca sesuai sektornya.'],
  ['MOS', 'Margin of Safety - selisih harga pasar terhadap estimasi nilai wajar model (Intrinsic Value/DCF). Positif = harga di bawah nilai wajar (berpotensi undervalued), negatif = di atas (overvalued).'],
] as const;

export default function AnalysisGlossary({ compact = false }: { compact?: boolean }) {
  return (
    <details className="group rounded-lg border border-tv-border bg-tv-bg/60">
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-tv-muted transition-colors hover:text-tv-text">
        Istilah analisis <span className="font-normal text-tv-muted/80">— penjelasan singkat untuk pemula</span>
      </summary>
      <div className={`border-t border-tv-border px-3 py-3 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'} grid gap-x-5 gap-y-2`}>
        {TERMS.map(([term, meaning]) => (
          <div key={term} className="text-[11px] leading-relaxed text-tv-muted">
            <span className="font-semibold text-tv-text">{term}</span> — {meaning}
          </div>
        ))}
      </div>
    </details>
  );
}
