import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi | SahamLens',
  description:
    'Data akun, autentikasi, watchlist, alert, portofolio virtual, feedback LensAI, retensi, dan penghapuan akun — sesuai implementasi nyata SahamLens.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
