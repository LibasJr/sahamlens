import Link from 'next/link';
export const metadata={title:'Ketentuan Penggunaan | SahamLens'};
export default function TermsPage(){return <main className="mx-auto max-w-3xl px-4 py-10 text-tv-text"><Link href="/" className="text-sm text-tv-blue">← Kembali</Link><h1 className="mt-5 font-heading text-3xl font-bold">Ketentuan Penggunaan</h1><div className="mt-6 space-y-5 text-sm leading-7 text-tv-muted">
<p>SahamLens adalah perangkat riset dan analisis. Output model, skor, valuasi, TP/CL, ownership flow, dan LensAI tidak menjamin hasil investasi dan tidak menggantikan pertimbangan profesional yang sesuai kebutuhan pengguna.</p>
<p>Pengguna bertanggung jawab memeriksa harga, likuiditas, aksi korporasi, keterlambatan data, serta kondisi pasar sebelum melakukan transaksi. Jangan memperlakukan status research-only atau model yang belum tervalidasi sebagai kepastian.</p>
<p>Dilarang menyalahgunakan layanan untuk mengganggu sistem, melewati kontrol akses, membanjiri endpoint, atau mengakses data pengguna lain.</p>
<p>Fitur dan sumber data dapat berubah ketika integritas, legalitas, atau ketersediaan sumber tidak lagi memenuhi standar SahamLens. Dalam kondisi tersebut sistem dapat fail-closed dan menampilkan data sebagai tidak tersedia.</p>
</div></main>}
