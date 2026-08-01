import { NextRequest } from 'next/server';
import { runController } from '@/shared/http/next-response.adapter';
import { handleAdminLoginByKey } from '@/modules/user';

// POST, bukan GET - ADMIN_SECRET_KEY tadinya dikirim lewat query string (?key=...),
// yang tercatat mentah di access log server/proxy/CDN dan riwayat browser. Form body
// tidak masuk URL, jadi tidak ikut ke kanal-kanal log berbasis URL itu.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const key = formData.get('key');
  return runController(async () => handleAdminLoginByKey(typeof key === 'string' ? key : null), req);
}
