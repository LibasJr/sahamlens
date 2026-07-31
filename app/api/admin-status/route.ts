import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { handleAdminStatus } from '@/modules/user';

// Client-side tidak boleh membaca cookie admin (HttpOnly), jadi komponen client
// tanya lewat endpoint ini untuk tahu status admin-nya sendiri.
export async function GET() {
  return runController(async () => handleAdminStatus(cookies()));
}
