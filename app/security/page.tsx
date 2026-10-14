import Link from 'next/link';

export const metadata = {
  title: 'Kebijakan Keamanan & Pelaporan Celah',
  description: 'Kebijakan pengungkapan kerentanan bertanggung jawab (Responsible Disclosure Policy) untuk platform SahamLens.',
  alternates: {
    canonical: '/security',
  },
};

export default function SecurityPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-tv-text">
      <Link href="/" className="text-sm text-tv-blue hover:underline">
        ← Kembali ke Beranda
      </Link>
      <h1 className="mt-5 font-heading text-3xl font-bold">
        Kebijakan Keamanan & Pelaporan Celah (Responsible Disclosure)
      </h1>
      <div className="mt-6 space-y-5 text-sm leading-7 text-tv-muted">
        <p>
          SahamLens berkomitmen menjaga keamanan data pengguna, sesi autentikasi, serta integritas jalur data riset pasar modal Indonesia. Halaman ini menjelaskan prosedur resmi pelaporan kerentanan keamanan sesuai dengan standar RFC 9116 (<code className="text-tv-text">/.well-known/security.txt</code>).
        </p>

        <h2 className="pt-1 text-base font-semibold text-tv-text">
          Saluran Pelaporan Resmi
        </h2>
        <p>
          Apabila Anda menemukan indikasi celah keamanan pada aplikasi web, API, maupun klien desktop SahamLens, mohon laporkan langsung melalui email ke{' '}
          <a href="mailto:security@sahamlens.id" className="font-medium text-tv-blue hover:underline">
            security@sahamlens.id
          </a>{' '}
          dalam bahasa Indonesia atau Inggris. Sertakan langkah reproduksi yang jelas, endpoint atau halaman yang terdampak, serta bukti konsep (PoC) minimal tanpa mengeksploitasi data pengguna lain.
        </p>

        <h2 className="pt-1 text-base font-semibold text-tv-text">
          Aturan Pengujian Aman (Safe Harbor)
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Jangan mengakses, memodifikasi, atau mengunduh data milik akun pengguna lain. Gunakan akun uji coba milik Anda sendiri saat memverifikasi batas otorisasi.
          </li>
          <li>
            Jangan melakukan pengujian beban berlebih (Denial of Service / DDoS), brute-force massal, atau pengiriman spam otomatis ke layanan email maupun endpoint AI.
          </li>
          <li>
            Beri waktu yang wajar bagi tim rekayasa SahamLens untuk memverifikasi dan menambal celah sebelum mempublikasikan temuan secara terbuka.
          </li>
        </ul>

        <h2 className="pt-1 text-base font-semibold text-tv-text">
          Kontrol Keamanan Arsitektur
        </h2>
        <p>
          SahamLens menerapkan isolasi sesi berbasis <span className="font-semibold text-tv-text">HttpOnly cookie</span>, perlindungan mutasi lintas-origin (<span className="font-semibold text-tv-text">Same-Origin CSRF Guard</span>), pembatasan kuota komputasi per pengguna/IP (<span className="font-semibold text-tv-text">Redis Rate Limiting</span>), kebijakan <span className="font-semibold text-tv-text">Content Security Policy (CSP)</span> dengan nonce per-request, serta penyimpanan hash IP satu arah untuk perlindungan privasi audit.
        </p>
      </div>
    </main>
  );
}
