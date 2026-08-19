import { guard } from '@/lib/sahamLensGuard';
guard();

export const dynamic = 'force-dynamic';
// BUG FIX (2026-08-05, diagnostik log produksi - lihat catatan lengkap di
// app/api/council/route.ts): generateAI() bisa mencoba sampai 6 kombinasi provider+model
// (timeout 8 detik masing-masing), melebihi default 10 detik Vercel Hobby plan.
export const maxDuration = 60;

import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { getSession } from '@/modules/user';
import { checkAiAccountBudget, rateLimitResult } from '@/shared/security/api-rate-limit';
import { generateAI, hasAnyAIProvider } from '@/lib/aiProviders';
import { LANG_COOKIE } from '@/shared/constants/cookie-names';

// BUG FIX (2026-08-01): dulu prompt ini merangkai "kondisi akun & pasar" (cash, jumlah
// posisi) - Beranda sekarang sengaja tidak lagi menampilkan portofolio (SahamLens
// aplikasi analisis/screener, bukan sekuritas; portofolio cukup di halaman Akun Demo),
// jadi briefing-nya diselaraskan jadi murni ringkasan PASAR & sinyal skor, tanpa data akun.
interface BriefingInput {
  topPick: { ticker: string; consensus: string; confidence: number } | null;
  indices: { name: string; changePct: number }[];
  pickCounts?: { attractive: number; breakout: number; undervalue: number };
  lang?: 'id' | 'en';
}

function fallbackBriefing(input: BriefingInput, isEn: boolean): string {
  const parts: string[] = [];
  const ihsg = input.indices.find((i) => i.name === 'IHSG');

  if (isEn) {
    if (ihsg) {
      parts.push(`IHSG ${ihsg.changePct >= 0 ? 'gained' : 'declined'} ${Math.abs(ihsg.changePct)}% today.`);
    }
    if (input.topPick) {
      parts.push(`Top signal: ${input.topPick.ticker} ${input.topPick.consensus} (LensScore ${input.topPick.confidence}/100).`);
    }
    if (input.pickCounts && (input.pickCounts.attractive || input.pickCounts.breakout)) {
      parts.push('AI identified multiple promising stock candidates and breakout signals today - explore LensRadar for details.');
    }
    return parts.length ? parts.join(' ') : 'No strong signals detected today. Check LensRadar for comprehensive scanning details.';
  }

  if (ihsg) {
    parts.push(`IHSG ${ihsg.changePct >= 0 ? 'menguat' : 'melemah'} ${Math.abs(ihsg.changePct)}% hari ini.`);
  }
  if (input.topPick) {
    parts.push(`Sinyal teratas: ${input.topPick.ticker} ${input.topPick.consensus} (LensScore ${input.topPick.confidence}/100).`);
  }
  // BUG FIX (2026-08-05, permintaan user): SEBELUMNYA menyebut angka persis
  // ("X saham menarik", "Y breakout") - tidak ada halaman manapun di aplikasi yang
  // menampilkan daftar konkret di balik angka itu (kategori "menarik"/attractive
  // dihapus dari /breakout-radar saat konsolidasi 8-tab jadi 1-tab, 2026-08-03), jadi
  // angka itu tidak bisa diverifikasi/ditelusuri pengguna. Diganti kalimat kualitatif
  // yang mengarahkan ke LensRadar, tanpa klaim angka pasti.
  if (input.pickCounts && (input.pickCounts.attractive || input.pickCounts.breakout)) {
    parts.push('AI menemukan sejumlah saham menarik dan beberapa sinyal breakout hari ini - cek LensRadar untuk detailnya.');
  }
  return parts.length ? parts.join(' ') : 'Belum ada sinyal kuat hari ini. Cek LensRadar untuk detail lengkap.';
}

export async function POST(req: NextRequest) {
  return runController(async () => {
  const session = await getSession();
  if (!session) {
    return { status: 401, body: { error: 'Belum login' } };
  }

  const budget = await checkAiAccountBudget(session.id, 'ai-briefing');
  if (!budget.allowed) return rateLimitResult(budget, 'Batas penggunaan AI sementara tercapai. Coba lagi nanti.');

  const input = (await req.json()) as BriefingInput;
  const isEn = input.lang === 'en' || req.cookies.get(LANG_COOKIE)?.value === 'en';

  if (!hasAnyAIProvider()) {
    return { status: 200, body: { briefing: fallbackBriefing(input, isEn), source: 'fallback' } };
  }

  const prompt = isEn
    ? `You are an AI investment assistant for SahamLens. Write ONE concise paragraph (maximum 3 sentences, natural English, professional yet engaging) summarizing today's IDX MARKET conditions and top opportunities based on the following data. Do not repeat raw numbers as a list; integrate them naturally. Do not provide explicit buy/sell advice beyond the data. Do not mention user portfolio/account - this application is a research & screener tool, not a brokerage.

Data:
- Market index: ${input.indices.map((i) => `${i.name} ${i.changePct >= 0 ? '+' : ''}${i.changePct}%`).join(', ') || 'unavailable'}
- Top signal: ${input.topPick ? `${input.topPick.ticker} ${input.topPick.consensus} (LensScore ${input.topPick.confidence} out of 100)` : 'no strong signals'}

Reply ONLY with the summary paragraph, no extra commentary.`
    : `Kamu adalah asisten AI investasi SahamLens. Tulis SATU paragraf pendek (maksimal 3 kalimat, Bahasa Indonesia santai tapi profesional) yang merangkum kondisi PASAR hari ini berdasarkan data berikut. Jangan mengulang angka mentah persis seperti daftar, rangkai jadi kalimat natural. Jangan beri saran beli/jual eksplisit di luar data yang ada. Jangan menyebut portofolio/akun pengguna - aplikasi ini alat analisis/screener, bukan platform sekuritas.

Data:
- Indeks pasar: ${input.indices.map((i) => `${i.name} ${i.changePct >= 0 ? '+' : ''}${i.changePct}%`).join(', ') || 'tidak tersedia'}
- Sinyal teratas: ${input.topPick ? `${input.topPick.ticker} ${input.topPick.consensus} (LensScore ${input.topPick.confidence} dari skala 0-100)` : 'tidak ada sinyal kuat'}

Balas hanya dengan paragraf ringkasannya, tanpa embel-embel lain.`;

  const text = await generateAI({ prompt, timeoutMs: 8000 });
  if (!text) {
    return { status: 200, body: { briefing: fallbackBriefing(input, isEn), source: 'fallback' } };
  }
  return { status: 200, body: { briefing: text.trim(), source: 'ai' } };
  }, req);
}
