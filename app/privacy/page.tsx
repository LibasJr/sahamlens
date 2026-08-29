import Link from 'next/link';
export const metadata={title:'Kebijakan Privasi | SahamLens'};
export default function PrivacyPage(){return <main className="mx-auto max-w-3xl px-4 py-10 text-tv-text"><Link href="/" className="text-sm text-tv-blue">← Kembali</Link><h1 className="mt-5 font-heading text-3xl font-bold">Kebijakan Privasi SahamLens</h1><div className="mt-6 space-y-5 text-sm leading-7 text-tv-muted">
<p>SahamLens menyimpan data akun yang diperlukan untuk autentikasi dan layanan pengguna, seperti email, hash password, status akses, watchlist, alert, dan portofolio virtual. Password tidak disimpan dalam bentuk plaintext.</p>
<p>Untuk keamanan, SahamLens dapat menyimpan metadata autentikasi terbatas seperti waktu login, hash alamat jaringan, prefix jaringan, dan user-agent. Retensi operasional diatur melalui job privacy cleanup; default histori autentikasi dan funnel adalah 90 hari.</p>
<p>Masukan LensAI dapat menyimpan prompt dan jawaban yang secara eksplisit dinilai pengguna untuk evaluasi kualitas. Default retensinya 180 hari. Jangan masukkan rahasia, password, atau data pribadi sensitif ke prompt.</p>
<p>Pengguna dapat menghapus akun dari menu profil. Watchlist, alert, portofolio virtual, histori autentikasi, dan feedback LensAI terkait akun akan dihapus. Catatan pembayaran yang diperlukan untuk rekonsiliasi dapat dipertahankan tanpa identitas akun.</p>
<p>Data pasar dan fundamental dapat berasal dari pihak ketiga. Provenance dan tanggal observasi dipertahankan agar data finansial tidak disajikan seolah lebih baru atau lebih pasti dari sumbernya.</p>
<p>Jika kebijakan operasional berubah, halaman ini harus diperbarui bersama perubahan kode/retensi terkait.</p>
</div></main>}
