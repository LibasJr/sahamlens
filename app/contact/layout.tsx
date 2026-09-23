import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hubungi Kami',
  description: 'Bantuan teknis dan masukan SahamLens. Kirim email ke support@sahamlens.id — balasan dalam 1 hari kerja.',
  alternates: { canonical: '/contact' },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
