import { guard } from '@/lib/sahamLensGuard';
guard();

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { generateAI, hasAnyAIProvider } from '@/lib/aiProviders';

// Penjelasan "kenapa harga wajar segini" untuk Intrinsic Value Engine (components/
// IntrinsicValue.tsx) - dulu kartu ini cuma tampilkan angka tanpa narasi. Pola ikuti
// app/api/ai-briefing/route.ts: kirim angka yang SUDAH dihitung di client (bukan
// hitung ulang di sini), AI cuma merangkai jadi kalimat, fallback rule-based kalau
// Gemini tidak tersedia/gagal supaya kartu tidak pernah kosong.
interface ExplainInput {
  symbol: string;
  fairValue: number;
  harga: number;
  mos: number;
  sektor: string;
  methods: Record<string, { name: string; value: number }>;
}

// BUG FIX (audit integritas data 2026-08-03, temuan M-10): teks ini SEBELUMNYA
// menyatakan fair_value adalah "median" dari metode-metode valuasi. Yang sebenarnya
// dihitung calculateIntrinsicValue() (modules/fundamental/service/dcf-valuation.service.ts)
// adalah RATA-RATA BERBOBOT menurut router sektor (mis. Banks: PBV 45% / DDM 30% /
// PER 25%), dengan renormalisasi bobot kalau ada metode yang tidak aktif - median hanya
// dipakai di satu cabang fallback yang jarang terjadi (tidak ada metode yang cocok
// bobotnya sama sekali). Pengguna yang diberi tahu metodologi yang salah tidak bisa
// memvalidasi angkanya. Sekarang menyebut "rata-rata berbobot" secara jujur, tanpa
// mengklaim persentase bobot spesifik (yang tidak dikirim ke endpoint ini).
function fallbackExplanation(input: ExplainInput): string {
  const status = input.mos >= 15 ? 'undervalued (diskon)' : input.mos <= -15 ? 'overvalued (premium)' : 'mendekati harga wajar';
  const methodNames = Object.values(input.methods || {}).map((m) => m.name).join(', ') || 'beberapa metode valuasi';
  return `Estimasi harga wajar Rp ${Math.round(input.fairValue).toLocaleString('id-ID')} untuk ${input.symbol} adalah rata-rata berbobot dari ${methodNames}, dengan bobot yang disesuaikan sektor ${input.sektor || 'saham ini'} (mis. bank memberatkan PBV & DDM, sektor consumer memberatkan PER & DCF). Dibanding harga pasar Rp ${Math.round(input.harga).toLocaleString('id-ID')}, margin of safety-nya ${input.mos >= 0 ? '+' : ''}${input.mos.toFixed(1)}% - artinya saham ini saat ini ${status}.`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }

  const input = (await req.json()) as ExplainInput;
  if (!input?.symbol || typeof input.fairValue !== 'number' || typeof input.harga !== 'number' || typeof input.mos !== 'number') {
    return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
  }

  // BUG FIX (audit integritas data 2026-08-03, temuan M-05): sebelumnya lewat getModel()
  // (satu model Gemini acak, tanpa retry) - disamakan dengan ai-briefing/route.ts, pakai
  // generateAI() yang mencoba semua kombinasi Gemini+Groq+OpenRouter yang terkonfigurasi.
  if (!hasAnyAIProvider()) {
    return NextResponse.json({ explanation: fallbackExplanation(input), source: 'fallback' });
  }

  const methodLines = Object.values(input.methods || {})
    .map((m) => `${m.name}: Rp ${Math.round(m.value).toLocaleString('id-ID')}`)
    .join(', ') || 'tidak tersedia';

  const prompt = `Kamu adalah anggota Council AI SahamLens yang bertugas menjelaskan hasil valuasi ke investor awam. Tulis SATU paragraf pendek (maksimal 4 kalimat, Bahasa Indonesia, substantif tapi mudah dipahami orang yang baru belajar saham) yang menjelaskan KENAPA harga wajar saham ${input.symbol} sebesar Rp ${Math.round(input.fairValue).toLocaleString('id-ID')} bisa muncul dari data berikut. Jangan cuma mengulang angka, jelaskan logikanya. Jangan beri anjuran beli/jual eksplisit.

Data:
- Sektor: ${input.sektor || 'tidak diketahui'}
- Harga pasar saat ini: Rp ${Math.round(input.harga).toLocaleString('id-ID')}
- Margin of Safety: ${input.mos >= 0 ? '+' : ''}${input.mos.toFixed(1)}%
- Nilai per metode valuasi: ${methodLines}

Balas hanya dengan paragraf penjelasannya, tanpa embel-embel lain.`;

  const text = await generateAI({ prompt, timeoutMs: 8000 });
  if (!text) {
    return NextResponse.json({ explanation: fallbackExplanation(input), source: 'fallback' });
  }
  return NextResponse.json({ explanation: text.trim(), source: 'ai' });
}
