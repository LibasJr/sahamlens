import { guard } from '@/lib/sahamLensGuard';
guard();

export const dynamic = 'force-dynamic';
// BUG FIX (2026-08-05, diagnostik log produksi - lihat catatan lengkap di
// app/api/council/route.ts): generateAI() bisa mencoba sampai 6 kombinasi provider+model
// (timeout 8 detik masing-masing), melebihi default 10 detik Vercel Hobby plan.
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { generateAI, hasAnyAIProvider } from '@/lib/aiProviders';

// BUG FIX (2026-08-01): dulu prompt ini merangkai "kondisi akun & pasar" (cash, jumlah
// posisi) - Beranda sekarang sengaja tidak lagi menampilkan portofolio (SahamLens
// aplikasi analisis/screener, bukan sekuritas; portofolio cukup di halaman Akun Demo),
// jadi briefing-nya diselaraskan jadi murni ringkasan PASAR & sinyal AI, tanpa data akun.
interface BriefingInput {
  topPick: { ticker: string; consensus: string; confidence: number } | null;
  indices: { name: string; changePct: number }[];
  pickCounts?: { attractive: number; breakout: number; undervalue: number };
}

function fallbackBriefing(input: BriefingInput): string {
  const parts: string[] = [];
  const ihsg = input.indices.find((i) => i.name === 'IHSG');
  if (ihsg) {
    parts.push(`IHSG ${ihsg.changePct >= 0 ? 'menguat' : 'melemah'} ${Math.abs(ihsg.changePct)}% hari ini.`);
  }
  if (input.topPick) {
    parts.push(`Sinyal AI teratas: ${input.topPick.ticker} ${input.topPick.consensus} (LensScore ${input.topPick.confidence}/100).`);
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
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }

  const input = (await req.json()) as BriefingInput;

  // BUG FIX (audit integritas data 2026-08-03, temuan M-05): sebelumnya lewat
  // getModel() (lib/gemini.ts, sudah dihapus - dead code sejak migrasi ini) - HANYA
  // memilih SATU model Gemini acak, tanpa retry
  // lintas model/provider. Kalau model yang terpilih gagal (kuota habis/nama model
  // sudah tidak berlaku), endpoint langsung jatuh ke fallback meski model/provider lain
  // masih tersedia. generateAI() (lib/aiProviders.ts) sudah mencoba SEMUA kombinasi
  // Gemini+Groq+OpenRouter yang terkonfigurasi sebelum menyerah - dipakai di sini juga.
  if (!hasAnyAIProvider()) {
    return NextResponse.json({ briefing: fallbackBriefing(input), source: 'fallback' });
  }

  // BUG FIX (2026-08-05, permintaan user): field "Temuan hari ini" (jumlah saham
  // menarik/breakout/undervalue) DIHAPUS dari data yang dikirim ke LLM - sebelumnya
  // model memparafrase angka itu jadi kalimat pasti ("50 saham menarik, 8 breakout,
  // dan 4 undervalue") padahal tidak ada halaman mana pun di aplikasi yang menampilkan
  // daftar konkret di baliknya (kategori itu sudah dihapus dari /breakout-radar saat
  // konsolidasi 8-tab jadi 1-tab, 2026-08-03) - klaim angka yang tidak bisa ditelusuri
  // pengguna. `pickCounts` di BriefingInput dipertahankan (masih dipakai fallbackBriefing
  // di atas dengan kalimat kualitatif, bukan angka), cuma tidak lagi masuk prompt AI.
  const prompt = `Kamu adalah asisten AI investasi SahamLens. Tulis SATU paragraf pendek (maksimal 3 kalimat, Bahasa Indonesia santai tapi profesional) yang merangkum kondisi PASAR hari ini berdasarkan data berikut. Jangan mengulang angka mentah persis seperti daftar, rangkai jadi kalimat natural. Jangan beri saran beli/jual eksplisit di luar data yang ada. Jangan menyebut portofolio/akun pengguna - aplikasi ini alat analisis/screener, bukan platform sekuritas.

Data:
- Indeks pasar: ${input.indices.map((i) => `${i.name} ${i.changePct >= 0 ? '+' : ''}${i.changePct}%`).join(', ') || 'tidak tersedia'}
- Sinyal AI teratas: ${input.topPick ? `${input.topPick.ticker} ${input.topPick.consensus} (LensScore ${input.topPick.confidence} dari skala 0-100)` : 'tidak ada sinyal kuat'}

Balas hanya dengan paragraf ringkasannya, tanpa embel-embel lain.`;

  const text = await generateAI({ prompt, timeoutMs: 8000 });
  if (!text) {
    return NextResponse.json({ briefing: fallbackBriefing(input), source: 'fallback' });
  }
  return NextResponse.json({ briefing: text.trim(), source: 'ai' });
}
