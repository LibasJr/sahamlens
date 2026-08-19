import { guard } from '@/lib/sahamLensGuard';
guard();

export const dynamic = 'force-dynamic';
// BUG FIX (2026-08-05, diagnostik log produksi - lihat catatan lengkap di
// app/api/council/route.ts): generateAI() bisa mencoba sampai 6 kombinasi provider+model
// (timeout 8 detik masing-masing), melebihi default 10 detik Vercel Hobby plan.
export const maxDuration = 60;

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { UnauthorizedError } from '@/shared/errors/app-error';
import { idxTickerParamSchema } from '@/shared/market/ticker-schema';
import { z } from 'zod';
import { getSession } from '@/modules/user';
import { checkAiAccountBudget, rateLimitExceeded } from '@/shared/security/api-rate-limit';
import { generateAI, hasAnyAIProvider } from '@/lib/aiProviders';
import { calculateIntrinsicValue } from '@/modules/fundamental';
import { getOrCompute } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

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
    return runController(async () => {
      throw new UnauthorizedError();
    }, req);
  }

  const budget = await checkAiAccountBudget(session.id, 'intrinsic-explain');
  if (!budget.allowed) return rateLimitExceeded(budget, 'Batas penggunaan AI sementara tercapai. Coba lagi nanti.');

  return runController(async () => {
  // BUG NYATA YANG DITUTUP DI SINI, bukan sekadar penyeragaman validasi.
  //
  // `symbol` dulu hanya di-trim + uppercase, TIDAK dinormalisasi ke bentuk `.JK`. Nilainya
  // langsung dipakai sebagai cache key `intrinsic:${symbol}` - dan komentar di bawah
  // mengklaim endpoint ini "pakai cache valuasi yang sama dengan kartu publik".
  // Klaim itu tidak pernah benar: /api/intrinsic/[ticker] menormalisasi lebih dulu dan
  // menulis ke `intrinsic:BBCA.JK`, sementara components/IntrinsicValue.tsx mengirim
  // `{ symbol: 'BBCA' }` (ticker di app/fundamental/page.tsx memang tanpa sufiks). Jadi
  // key yang dibaca di sini `intrinsic:BBCA` - SELALU cache miss, dan setiap klik
  // "Penjelasan LensAI" menghitung ulang seluruh DCF/PBV/PER yang baru saja dihitung
  // kartu di sebelahnya.
  //
  // Memakai skema ticker bersama menormalisasi keduanya ke `BBCA.JK`, sehingga cache
  // benar-benar dipakai bersama seperti yang selalu diniatkan.
  const { symbol } = parseOrThrow(
    z.object({ symbol: idxTickerParamSchema }),
    await req.json(),
  );

  // BUG FIX (audit logika & algoritma 2026-08-05, temuan H-12): endpoint ini SEBELUMNYA
  // menerima `fairValue`, `harga`, `mos`, dan `methods` LANGSUNG dari body request lalu
  // menyuruh AI menjelaskan "kenapa harga wajarnya segitu". Artinya siapa pun bisa
  // mengirim angka karangan dan mendapatkan narasi meyakinkan dari LensAI yang
  // membenarkannya - persis pola yang dilarang di seluruh audit ini, cuma pintu masuknya
  // dari client. Sekarang HANYA simbol yang diterima; seluruh angka dihitung ulang di
  // server dengan fungsi yang sama dipakai kartu valuasi (calculateIntrinsicValue).
  // Hitung tetap dari server, tetapi pakai cache valuasi yang sama dengan kartu publik
  // supaya klik Penjelasan LensAI tidak menghitung ulang DCF/PBV/PER yang baru dilihat.
  const cachedIntrinsic = await getOrCompute(
    `sahamlens:cache:computed:intrinsic:${symbol}`,
    CACHE_TTL_SEC.TECHNICAL,
    async () => (await calculateIntrinsicValue(symbol).catch(() => null)) ?? { notFound: true as const },
  );
  if ('notFound' in cachedIntrinsic || !(cachedIntrinsic.fair_value > 0)) {
    // TIDAK dilempar sebagai ServiceUnavailableError: body ini punya DUA field, dan
    // `detail` yang menyebut simbolnya itu yang ditampilkan UI. AppError hanya
    // menghasilkan { error, code }, jadi melemparnya akan membuang detailnya.
    return {
      status: 503,
      body: {
        error: 'Data valuasi tidak tersedia',
        detail: `Nilai wajar ${symbol} tidak bisa dihitung dari data yang ada saat ini.`,
      },
    };
  }

  const intrinsic = cachedIntrinsic;

  const input: ExplainInput = {
    symbol,
    fairValue: intrinsic.fair_value,
    harga: intrinsic.harga,
    mos: intrinsic.mos,
    sektor: intrinsic.sektor,
    methods: intrinsic.methods,
  };

  const methodLines = Object.values(input.methods || {})
    .map((m) => `${m.name}: Rp ${Math.round(m.value).toLocaleString('id-ID')}`)
    .join(', ') || 'tidak tersedia';

  // Tidak ada data akun pada prompt. Fingerprint menjaga jawaban AI lama tidak dipakai
  // ketika harga atau hasil valuasi berubah.
  const snapshotFingerprint = [
    Math.round(input.fairValue),
    Math.round(input.harga),
    input.mos.toFixed(2),
    input.sektor || 'unknown',
  ].join(':');
  const response = await getOrCompute(
    `sahamlens:cache:computed:intrinsic-explain:v1:${input.symbol}:${snapshotFingerprint}`,
    CACHE_TTL_SEC.INTRINSIC_EXPLANATION,
    async () => {
      // BUG FIX (audit integritas data 2026-08-03, temuan M-05): sebelumnya lewat getModel()
      // (satu model Gemini acak, tanpa retry) - disamakan dengan ai-briefing/route.ts, pakai
      // generateAI() yang mencoba semua kombinasi Gemini+Groq+OpenRouter yang terkonfigurasi.
      if (!hasAnyAIProvider()) return { explanation: fallbackExplanation(input), source: 'fallback' as const };

      const prompt = `Kamu adalah anggota LensAI SahamLens yang bertugas menjelaskan hasil valuasi ke investor awam. Tulis SATU paragraf pendek (maksimal 4 kalimat, Bahasa Indonesia, substantif tapi mudah dipahami orang yang baru belajar saham) yang menjelaskan KENAPA harga wajar saham ${input.symbol} sebesar Rp ${Math.round(input.fairValue).toLocaleString('id-ID')} bisa muncul dari data berikut. Jangan cuma mengulang angka, jelaskan logikanya. Jangan beri anjuran beli/jual eksplisit.

Data:
- Sektor: ${input.sektor || 'tidak diketahui'}
- Harga pasar saat ini: Rp ${Math.round(input.harga).toLocaleString('id-ID')}
- Margin of Safety: ${input.mos >= 0 ? '+' : ''}${input.mos.toFixed(1)}%
- Nilai per metode valuasi: ${methodLines}

Balas hanya dengan paragraf penjelasannya, tanpa embel-embel lain.`;

      const text = await generateAI({ prompt, timeoutMs: 8000 });
      return text
        ? { explanation: text.trim(), source: 'ai' as const }
        : { explanation: fallbackExplanation(input), source: 'fallback' as const };
    },
  );
  return { status: 200, body: response };
  }, req);
}
