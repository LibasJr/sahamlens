import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { handleGetProStatus } from '@/modules/user';

// Dipakai form Aktivasi Pro di /admin untuk menampilkan status sekarang sebelum admin
// memilih durasi - supaya jelas apakah sedang memperpanjang atau mengaktifkan dari nol.
// Digerbangi cookie admin yang sama dengan set-pro, dan sengaja hanya mengembalikan
// tiga field (bukan objek user apa adanya, yang memuat password_hash dan kode reset).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return runController(async () =>
    handleGetProStatus(cookies(), { email: searchParams.get('email') ?? undefined })
  );
}
