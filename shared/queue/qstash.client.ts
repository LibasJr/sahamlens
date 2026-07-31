import { Client } from '@upstash/qstash';

// Dipakai untuk MEMBUAT schedule/mengirim pesan ke antrean (arah keluar) - beda
// dari qstash-signature.ts yang MEMVERIFIKASI pesan MASUK dari QStash.
const g = globalThis as unknown as { __sahamlensQStashClient?: Client };

export function getQStashClient(): Client | null {
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  if (!g.__sahamlensQStashClient) {
    g.__sahamlensQStashClient = new Client({ token });
  }
  return g.__sahamlensQStashClient;
}
