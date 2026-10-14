import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi',
  description:
    'Data akun, autentikasi, watchlist, alert, portofolio virtual, feedback LensAI, retensi, dan penghapusan akun — sesuai implementasi nyata SahamLens.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
