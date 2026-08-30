import Link from 'next/link';
import { ArrowLeft, Bot, BrainCircuit, ClipboardCheck, ShieldCheck, Sparkles, Target } from 'lucide-react';

export const metadata = {
  title: 'Multi-Agent AI Team | SahamLens',
  description: 'Ringkasan tim AI multi-agent SahamLens untuk riset, validasi, dan eksekusi aman.',
  robots: { index: false, follow: false },
};

const ROLES = [
  { icon: BrainCircuit, title: 'Riset', desc: 'Mengumpulkan sinyal, data pasar, dan konteks emiten.' },
  { icon: Target, title: 'Analisis', desc: 'Menyusun hipotesis, skenario, dan prioritas kandidat.' },
  { icon: ClipboardCheck, title: 'Validasi', desc: 'Mengecek konsistensi, batasan, dan bukti pendukung.' },
  { icon: ShieldCheck, title: 'Guardrail', desc: 'Menahan output yang berisiko, bias, atau tidak cukup bukti.' },
  { icon: Bot, title: 'Orkestrasi', desc: 'Menggabungkan beberapa model sesuai tugas dan fallback.' },
  { icon: Sparkles, title: 'Ringkasan', desc: 'Mengubah hasil kompleks jadi keputusan yang bisa dibaca.' },
];

export default function MultiAgentPage() {
  return (
    <main className="min-h-screen bg-tv-bg text-tv-text px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Link>
        <div className="rounded-3xl border border-tv-border bg-tv-card p-6 sm:p-8 shadow-xl">
          <p className="text-xs uppercase tracking-[0.3em] text-tv-yellow">AI Team Preview</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Tim AI multi-agent SahamLens</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-tv-muted">
            Konsep ini membagi kerja riset ke beberapa peran agar hasil lebih cepat, lebih terstruktur,
            dan tetap aman. Semua output harus tetap tunduk ke LensScore v1.6.1 dan
            decision-agent-v2-hybrid; bukan satu model yang mengerjakan semua hal sendirian.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ROLES.map(({ icon: Icon, title, desc }) => (
              <section key={title} className="rounded-2xl border border-tv-border/70 bg-tv-bg/70 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-tv-blue/15 p-2 text-tv-blue">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="font-semibold">{title}</h2>
                </div>
                <p className="mt-3 text-sm leading-6 text-tv-muted">{desc}</p>
              </section>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-tv-green/30 bg-tv-green/10 p-4 text-sm text-tv-text">
            Cocok untuk alur: riset → validasi → shortlist → keputusan akhir manusia.
          </div>
        </div>
      </div>
    </main>
  );
}
