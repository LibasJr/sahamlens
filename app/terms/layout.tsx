import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Ketentuan Penggunaan | SahamLens',
  description:
    'Riset, bukan penasihat. Tanggung jawab keputusan pengguna, keterbatasan data pasar, dan batasan tanggung jawab SahamLens — sesuai implementasi nyata.',
  alternates: { canonical: '/terms' },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
