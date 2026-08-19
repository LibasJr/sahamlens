import { Card } from '@/components/ui/Card';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import { redirect } from 'next/navigation';
import { isAdminServer } from '@/modules/user';
import { listRecentLensAiFeedback, summarizeLensAiFeedbackByIntent } from '@/modules/ai/repository/lensai-feedback.repository';

export const metadata = { robots: { index: false, follow: false } };

function waktuWib(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? 'waktu tidak terbaca'
    : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) + ' WIB';
}

export default async function LensAiFeedbackAdminPage() {
  if (!(await isAdminServer())) redirect('/admin-login');

  const [feedback, summaryByIntent] = await Promise.all([
    listRecentLensAiFeedback(),
    summarizeLensAiFeedbackByIntent(),
  ]);
  const negative = feedback.filter((row) => row.rating === 'down').length;

  return (
    <div className="min-h-screen bg-tv-bg p-4 font-sans text-tv-text sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted transition-colors hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Admin Panel
        </Link>
        <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tv-accent">LensAI Quality</p>
            <h1 className="mt-2 font-heading text-2xl font-bold sm:text-3xl">Feedback LensAI</h1>
            <p className="mt-2 max-w-3xl text-sm text-tv-muted">
              Tinjau jawaban yang pengguna tandai membantu atau tidak tepat. Gunakan pertanyaan dan intent-nya untuk menentukan knowledge, routing, atau test regresi berikutnya.
            </p>
          </div>
          <Card as="div" className="border-tv-border px-4 py-3 text-sm" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
            <div className="font-number text-lg font-bold">{feedback.length}</div>
            <div className="text-tv-muted">feedback terbaru · {negative} perlu ditinjau</div>
          </Card>
        </div>

        {summaryByIntent.length > 0 && (
          <Card as="section" className="mb-7 border-tv-border p-4 sm:p-5" aria-labelledby="feedback-summary-title" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 id="feedback-summary-title" className="font-heading text-lg font-bold">Ringkasan otomatis per intent</h2>
                <p className="mt-1 text-xs text-tv-muted">Diurutkan dari jumlah 👎 terbanyak untuk memprioritaskan perbaikan routing, knowledge, atau test regresi.</p>
              </div>
              <span className="text-xs text-tv-muted">seluruh feedback tersimpan</span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {summaryByIntent.map((item) => (
                <div key={item.intent ?? 'unknown'} className="rounded-lg border border-tv-border/70 bg-tv-bg/40 px-3 py-2.5">
                  <div className="truncate text-xs font-bold text-tv-text">{item.intent ?? 'Intent tidak tercatat'}</div>
                  <div className="mt-1.5 flex gap-3 text-xs text-tv-muted">
                    <span>{item.total} total</span>
                    <span className={item.negative > 0 ? 'font-semibold text-tv-red' : ''}>👎 {item.negative}</span>
                    <span className="text-tv-green">👍 {item.positive}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {!feedback.length ? (
          <Card as="div" className="border-dashed border-tv-border p-8 text-center text-sm text-tv-muted" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
            <MessageSquare className="mx-auto mb-3 h-8 w-8 text-tv-blue" />
            Belum ada feedback. Tombol 👍/👎 pada jawaban LensAI akan mengisi daftar ini.
          </Card>
        ) : (
          <div className="space-y-3">
            {feedback.map((row) => {
              const negativeRow = row.rating === 'down';
              return (
                <article key={row.id} className={`rounded-xl border bg-tv-card p-4 ${negativeRow ? 'border-tv-red/35' : 'border-tv-green/25'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${negativeRow ? 'bg-tv-red/10 text-tv-red' : 'bg-tv-green/10 text-tv-green'}`}>
                      {negativeRow ? <ThumbsDown className="h-3.5 w-3.5" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                      {negativeRow ? 'Tidak tepat' : 'Membantu'}
                    </span>
                    <span className="text-xs text-tv-muted">{waktuWib(row.created_at)}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-tv-text">Pertanyaan: {row.prompt}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-tv-muted">{row.answer}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-tv-muted">
                    <span>Intent: <strong className="text-tv-text">{row.intent ?? 'tidak tercatat'}</strong></span>
                    {row.source_label && <span>Sumber: {row.source_label}</span>}
                    {row.data_timestamp && <span>Waktu data: {row.data_timestamp}</span>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
