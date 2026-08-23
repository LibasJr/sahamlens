import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { ForbiddenError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import { getTransparencyData } from '@/modules/lens-radar/service/transparency.service';

export const maxDuration = 300;

/**
 * Endpoint ini DULU publik dan memakai publicCacheHeaders. Keduanya dicabut bersamaan,
 * dan bukan sebagai dua keputusan terpisah:
 *
 * Menu Transparansi dipindah ke balik gerbang admin (23 Agustus 2026). Gerbang di halaman
 * saja tidak menutup apa pun - datanya tetap bisa diambil siapa pun dengan membuka
 * /api/transparency langsung, dan gerbang yang bisa dilewati dengan mengetik URL bukan
 * gerbang (CLAUDE.md §2).
 *
 * `publicCacheHeaders` HARUS ikut hilang begitu respons ini berbeda menurut sesi:
 * `CDN-Cache-Control: public` membuat Cloudflare menyajikan SATU salinan ke siapa pun,
 * jadi satu tarikan oleh admin akan disajikan ulang ke pengunjung berikutnya - persis
 * invarian yang dijaga __tests__/public-cache-headers.test.ts (CLAUDE.md §3).
 */
export async function GET() {
  return runController(async () => {
    if (!await isAdminFromRequestCookies(await cookies())) throw new ForbiddenError();
    return { status: 200, body: await getTransparencyData() };
  });
}
