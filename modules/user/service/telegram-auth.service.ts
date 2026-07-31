import crypto from 'crypto';
import { supabaseAdmin } from '../../../lib/supabase';
import type { TelegramAuthData } from '../types/user.types';

export function getAdminSecret(): string | undefined {
  return process.env.ADMIN_SECRET_KEY;
}

export function getAdminTelegramIds(): string[] {
  const single = process.env.ADMIN_TELEGRAM_ID ? [process.env.ADMIN_TELEGRAM_ID] : [];
  const list = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set([...single, ...list]));
}

/**
 * Verifikasi data dari Telegram Login Widget sesuai algoritma resmi Telegram:
 * https://core.telegram.org/widgets/login#checking-authorization
 * secret_key = SHA256(bot_token); check_string = "key=value" (selain hash) diurutkan & digabung "\n";
 * valid kalau HMAC-SHA256(check_string, secret_key) === data.hash.
 */
export function verifyTelegramAuth(data: Record<string, string>): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !data.hash) return false;

  const { hash, ...rest } = data;
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');

  const secret = crypto.createHash('sha256').update(token).digest();
  const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

  if (hmac.length !== hash.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash))) return false;

  // Tolak link login yang sudah lebih dari 1 hari (cegah replay kalau URL lama ke-share ulang).
  const authDate = Number(data.auth_date) * 1000;
  if (!authDate || Date.now() - authDate > 24 * 60 * 60 * 1000) return false;

  return true;
}

// Dipindah dari admin.controller.ts (code review H2) - controller sebelumnya
// akses supabaseAdmin langsung, melanggar layering yang benar di module ini
// (auth.service.ts/admin.service.ts sudah benar mendelegasikan akses data ke
// service, admin.controller.ts yang tertinggal).
//
// TODO: supabaseAdmin adalah shim lib/supabase.ts (file lokal, lihat audit H2
// ORIGINAL - beda H2 dari code review ini), bukan Supabase asli. Dipertahankan
// apa adanya - "user" di sini konsep user bot Telegram (telegram_id), sistem
// terpisah dari tabel `users` Postgres yang dipakai login web.
export async function upsertTelegramUser(
  telegramId: number,
  profile: { username?: string; first_name?: string },
  isAdmin: boolean
): Promise<void> {
  const defaultRole = isAdmin ? 'admin' : 'free';
  const defaultSisa = isAdmin ? 999 : 5;

  try {
    const { data: existingUser } = await supabaseAdmin.from('users').select('*').eq('telegram_id', telegramId).single();

    if (!existingUser) {
      await supabaseAdmin.from('users').insert({
        telegram_id: telegramId,
        username: profile.username || null,
        first_name: profile.first_name || null,
        role: defaultRole,
        sisa_analisa: defaultSisa,
        last_reset: new Date().toISOString().split('T')[0],
      });
    } else if (isAdmin && existingUser.role !== 'admin') {
      await supabaseAdmin.from('users').update({ role: 'admin', sisa_analisa: 999 }).eq('telegram_id', telegramId);
    } else {
      await supabaseAdmin
        .from('users')
        .update({ username: profile.username || existingUser.username, first_name: profile.first_name || existingUser.first_name })
        .eq('telegram_id', telegramId);
    }
  } catch {
    // Kegagalan upsert profil tidak boleh menggagalkan login - konsisten dengan perilaku lama.
  }
}

export type { TelegramAuthData };
