import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccess } from '@/modules/user';
import { scanBreakouts } from '@/modules/recommendation';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Belum login' }, { status: 401 });
    }

    const hasPro = checkProAccess(session);
    if (!hasPro) {
      // 402 (bukan 429) - ini soal akses langganan, bukan rate limit. Pesan lama
      // "Limit analisa harian habis" menyesatkan karena tidak ada penghitung kuota
      // sungguhan untuk fitur ini (temuan H9, API Guideline poin 2 prioritas adopsi).
      return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
    }

    const data = await scanBreakouts();

    return NextResponse.json({
      data,
      lastUpdate: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
