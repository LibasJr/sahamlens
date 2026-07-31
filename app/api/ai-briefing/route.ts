import { guard } from '@/lib/sahamLensGuard';
guard();

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/modules/user';
import { getModel } from '@/lib/gemini';

interface BriefingInput {
  cash: number;
  totalCost: number;
  holdingsCount: number;
  topPick: { ticker: string; consensus: string; confidence: number } | null;
  indices: { name: string; changePct: number }[];
}

function fallbackBriefing(input: BriefingInput): string {
  const parts: string[] = [];
  if (input.topPick) {
    parts.push(`Sinyal AI hari ini: ${input.topPick.ticker} ${input.topPick.consensus} dengan confidence ${input.topPick.confidence}%.`);
  }
  if (input.holdingsCount > 0) {
    parts.push(`Portofolio kamu aktif dipantau dengan ${input.holdingsCount} posisi terbuka.`);
  }
  const ihsg = input.indices.find((i) => i.name === 'IHSG');
  if (ihsg) {
    parts.push(`IHSG ${ihsg.changePct >= 0 ? 'menguat' : 'melemah'} ${Math.abs(ihsg.changePct)}% hari ini.`);
  }
  return parts.length ? parts.join(' ') : 'Belum ada sinyal kuat hari ini. Cek Stock Recommendations untuk detail lengkap.';
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }

  const input = (await req.json()) as BriefingInput;

  const model = getModel();
  if (!model) {
    return NextResponse.json({ briefing: fallbackBriefing(input), source: 'fallback' });
  }

  try {
    const prompt = `Kamu adalah asisten AI investasi SahamLens. Tulis SATU paragraf pendek (maksimal 3 kalimat, Bahasa Indonesia santai tapi profesional) yang merangkum kondisi akun & pasar investor hari ini berdasarkan data berikut. Jangan mengulang angka mentah persis seperti daftar, rangkai jadi kalimat natural. Jangan beri saran beli/jual eksplisit di luar data yang ada.

Data:
- Cash: Rp ${input.cash.toLocaleString('id-ID')}
- Jumlah posisi terbuka: ${input.holdingsCount}
- Sinyal AI teratas: ${input.topPick ? `${input.topPick.ticker} ${input.topPick.consensus} (confidence ${input.topPick.confidence}%)` : 'tidak ada sinyal kuat'}
- Indeks pasar: ${input.indices.map((i) => `${i.name} ${i.changePct >= 0 ? '+' : ''}${i.changePct}%`).join(', ') || 'tidak tersedia'}

Balas hanya dengan paragraf ringkasannya, tanpa embel-embel lain.`;

    const result = await model.generateContent(prompt, { timeout: 8000 });
    const text = result.response.text().trim();

    if (!text) {
      return NextResponse.json({ briefing: fallbackBriefing(input), source: 'fallback' });
    }
    return NextResponse.json({ briefing: text, source: 'ai' });
  } catch {
    return NextResponse.json({ briefing: fallbackBriefing(input), source: 'fallback' });
  }
}
