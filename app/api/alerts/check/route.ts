import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { checkAndTriggerAlerts } from '@/modules/notification';

// WAJIB - route ini tidak memanggil cookies()/headers() sama sekali, jadi tanpa
// penanda ini Next.js men-static-generate-nya SEKALI saat `next build` dan
// menyajikan hasil beku itu ke SEMUA request selamanya (ditemukan lewat smoke
// test: endpoint selalu balas checked:0 walau ada alert baru di DB). Route yang
// melakukan efek samping (query DB live, tulis triggered=true) tidak boleh statis.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || 'http';
    const origin = `${protocol}://${host}`;

    const result = await checkAndTriggerAlerts(origin);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Error checking alerts:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
