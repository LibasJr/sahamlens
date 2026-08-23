import Link from 'next/link';
export const metadata={title:'Disclaimer Investasi | SahamLens'};
export default function DisclaimerPage(){return <main className="mx-auto max-w-3xl px-4 py-10 text-tv-text"><Link href="/" className="text-sm text-tv-blue">← Kembali</Link><h1 className="mt-5 font-heading text-3xl font-bold">Disclaimer Investasi & Data</h1><div className="mt-6 space-y-5 text-sm leading-7 text-tv-muted">
<p>Informasi SahamLens bersifat informatif dan riset, bukan ajakan membeli atau menjual efek. Nilai investasi dapat naik maupun turun.</p>
<p>Harga/market data dapat berasal dari Yahoo Finance dan sumber pihak ketiga lain serta dapat terlambat. Ownership Flow KSEI adalah komposisi kepemilikan pada tanggal snapshot, bukan transaksi broker harian. Data backfill tidak boleh dibaca sebagai informasi yang sudah tersedia secara real-time pada tanggal historisnya.</p>
<h2 className="pt-1 text-base font-semibold text-tv-text">Apa arti &ldquo;belum tervalidasi&rdquo;?</h2>
<p>Kami belum punya cukup bukti forward bahwa LensScore dapat memprediksi pergerakan harga secara konsisten. Bukti tersebut sedang dikumpulkan dan diuji dengan data yang benar-benar tersedia setelah model dibekukan. Sampai jumlah dan durasinya cukup, perlakukan skor sebagai <span className="font-semibold text-tv-text">bahan riset dan pembanding</span>, bukan sinyal beli atau jaminan hasil.</p>
<p>LensScore dan laboratorium validasi mempertahankan status research/validation masing-masing. SahamLens tidak boleh menyebut model tervalidasi sebelum gate forward out-of-sample dan sample minimum yang ditetapkan benar-benar terpenuhi.</p>
<p>Valuasi bergantung pada asumsi model. Perubahan asumsi makro tidak diterapkan diam-diam; model production mempertahankan versi/freeze agar hasil historis dapat diaudit.</p>
</div></main>}
