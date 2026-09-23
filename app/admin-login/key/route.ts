import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleAdminLoginByKey } from '@/modules/user';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';

// POST, bukan GET - ADMIN_SECRET_KEY tadinya dikirim lewat query string (?key=...),
// yang tercatat mentah di access log server/proxy/CDN dan riwayat browser. Form body
// tidak masuk URL, jadi tidak ikut ke kanal-kanal log berbasis URL itu.
export async function POST(req: NextRequest) {
  return runController(async () => {
    assertTrustedSameOrigin(req);
    // `req.formData()` MELEMPAR TypeError kalau Content-Type request bukan
    // multipart/form-data (mis. klien mengirim JSON, atau tanpa Content-Type sama
    // sekali). Dulu lemparan itu jatuh ke catch runController dan menjadi 500
    // INTERNAL_ERROR - padahal server tidak sedang bermasalah, hanya bentuk request
    // klien yang salah. Terukur 2026-09-24: POST JSON apa pun ke endpoint ini 500.
    //
    // Bentuk request yang BENAR tidak berubah: key yang salah tetap dibalas 404
    // "Not found" oleh handleAdminLoginByKey, supaya keberadaan gate admin tidak
    // terkonfirmasi ke penebak.
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return { status: 400, body: { error: 'Format permintaan tidak didukung' } };
    }
    const key = formData.get('key');
    return handleAdminLoginByKey(typeof key === 'string' ? key : null);
  }, req);
}
