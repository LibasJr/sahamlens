import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ForbiddenError, ValidationError, NotFoundError, ConflictError } from '../../../shared/errors/app-error';
import { ADMIN_COOKIE, ADMIN_BADGE_COOKIE, ROLE_BADGE_COOKIE } from '../../../shared/constants/cookie-names';
import { signAdminToken } from '../../../shared/auth/admin-token';
import { isAdminFromRequestCookies, getAdminStatsToday, getAdminExportData } from '../service/admin.service';
import { getUserByEmail, updateUser, createUser } from '../repository/user.repository';
import { extendProExpiry } from '../service/pro-expiry.service';
import { getAdminSecretHash, setAdminSecretHash } from '../repository/admin-secret.repository';
import { provisionPortfolio } from '../../portfolio';
import { TRIAL_DAYS, MIN_PASSWORD_LENGTH } from '../constants/user.constants';
import { logger } from '../../../shared/logger/logger';
import type { HttpResult, CookieToSet } from '../../../shared/types/http-result.types';

// getAdminSecret dipindah dari service/telegram-auth.service.ts (dihapus - login via
// Telegram sudah tidak dipakai) supaya handleAdminLoginByKey tetap jalan.
function getAdminSecret(): string | undefined {
  return process.env.ADMIN_SECRET_KEY;
}

const THIRTY_DAYS = 60 * 60 * 24 * 30;

async function adminCookies(): Promise<CookieToSet[]> {
  return [
    // Nilainya JWT bertanda tangan, bukan konstanta - lihat shared/auth/admin-token.ts.
    { name: ADMIN_COOKIE, value: await signAdminToken(), options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS } },
    // Non-HttpOnly, HANYA untuk badge UI client-side - lihat catatan di
    // shared/constants/cookie-names.ts. Middleware/keputusan server TIDAK memercayai ini.
    { name: ADMIN_BADGE_COOKIE, value: 'true', options: { httpOnly: false, sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS } },
    { name: ROLE_BADGE_COOKIE, value: 'admin', options: { httpOnly: false, sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS } },
  ];
}

// Perbandingan timing-safe (code review M5) - `!==` biasa membocorkan info lewat
// waktu eksekusi (berhenti di karakter pertama yang beda), memungkinkan secret
// ditebak byte-per-byte lewat pengukuran waktu berulang. Pola sama dengan
// verifyTelegramAuth di telegram-auth.service.ts, disamakan di sini.
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Password admin sekarang ada DUA sumber valid - hash di database (bisa diganti
// admin sendiri lewat /admin, lihat handleChangeAdminSecret) ATAU ADMIN_SECRET_KEY
// env var (jalur darurat permanen, bukan cuma bootstrap - supaya admin tetap bisa
// masuk kalau hash di DB hilang/rusak). Salah satu cocok sudah cukup.
async function verifyAdminSecret(key: string): Promise<boolean> {
  let dbHash: string | null = null;
  try {
    dbHash = await getAdminSecretHash();
  } catch (err) {
    // DB tidak terjangkau/gagal - jatuh ke env var, jangan biarkan masalah
    // database mengunci admin keluar dari satu-satunya jalur darurat yang ada.
    logger.warn('Gagal baca admin secret dari DB, jatuh ke env var', { err });
  }
  if (dbHash) {
    // bcrypt.compare juga dibungkus try/catch (bukan cuma pembacaan DB di atas) -
    // hash rusak/tidak valid tidak boleh melempar error yang lolos dari fallback
    // env var di bawah (code review final: risiko lockout yang sama, sumber beda).
    const matchesDb = await bcrypt.compare(key, dbHash).catch(() => false);
    if (matchesDb) return true;
  }

  const envSecret = getAdminSecret();
  if (envSecret && timingSafeStringEqual(key, envSecret)) return true;

  return false;
}

// Key salah -> 404 (tidak membocorkan bahwa route ini ada).
export async function handleAdminLoginByKey(key: string | null): Promise<HttpResult> {
  if (!key || !(await verifyAdminSecret(key))) {
    return { status: 404, body: { error: 'Not found' } };
  }
  return { status: 302, body: null, redirectTo: '/dashboard', cookiesToSet: await adminCookies() };
}

export async function handleAdminStatus(cookieStore: { get(name: string): { value: string } | undefined }): Promise<HttpResult> {
  return { status: 200, body: { isAdmin: await isAdminFromRequestCookies(cookieStore) } };
}

export async function handleAdminStats(cookieStore: { get(name: string): { value: string } | undefined }): Promise<HttpResult> {
  if (!await isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  return { status: 200, body: getAdminStatsToday() };
}

export async function handleAdminExport(
  cookieStore: { get(name: string): { value: string } | undefined },
  query: { cursor?: string; limit?: string } = {}
): Promise<HttpResult> {
  if (!await isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  const data = await getAdminExportData({ cursor: query.cursor, limit: query.limit ? Number(query.limit) : undefined });
  return { status: 200, body: { success: true, ...data } };
}

export async function handleSetProStatus(
  cookieStore: { get(name: string): { value: string } | undefined },
  body: { email?: unknown; isPro?: unknown; months?: unknown; expiresAt?: unknown }
): Promise<HttpResult> {
  if (!await isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  if (typeof body.email !== 'string' || !body.email || typeof body.isPro !== 'boolean') {
    throw new ValidationError('email dan isPro wajib diisi dengan tipe yang benar');
  }
  const user = await getUserByEmail(body.email);
  if (!user) throw new NotFoundError('User tidak ditemukan');

  let proExpiresAt: string | null = null;
  if (body.isPro) {
    if (typeof body.expiresAt === 'string' && body.expiresAt) {
      // Tanggal bebas dipakai apa adanya - termasuk tanggal di masa lalu, yang efeknya
      // sama dengan mencabut akses. Itu bisa disengaja, jadi tidak ditolak.
      //
      // Tapi tanggal yang TIDAK BISA DIBACA harus ditolak sebagai kesalahan input. Tanpa
      // guard ini `new Date('30-02-2026').toISOString()` melempar RangeError mentah, dan
      // admin cuma melihat "Internal Server Error" tanpa tahu kolom mana yang salah.
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new ValidationError(`Tanggal kedaluwarsa "${body.expiresAt}" tidak bisa dibaca. Pakai format YYYY-MM-DD.`);
      }
      proExpiresAt = parsed.toISOString();
    } else {
      const months = typeof body.months === 'number' && body.months > 0 ? body.months : 1;
      proExpiresAt = extendProExpiry(user.pro_expires_at ?? null, months);
    }
  }

  // Saat dicabut, tanggal ikut dikosongkan - menyisakan tanggal lama pada akun non-Pro
  // membingungkan dan bisa menghidupkan akses lagi kalau is_pro dinyalakan tanpa durasi.
  await updateUser(user.id, { is_pro: body.isPro, pro_expires_at: proExpiresAt });
  logger.info('Admin set-pro', { email: body.email, isPro: body.isPro, proExpiresAt });
  return { status: 200, body: { email: body.email, isPro: body.isPro, proExpiresAt } };
}

// BARU (2026-08-14, permintaan pengguna: "bisa buatkan akun user/user di sistem, ini
// untuk user tes"). Sesi agen ini TIDAK PUNYA akses database production atau jaringan
// ke situs live, jadi tidak bisa membuat akun langsung dari sesi - alat ini yang
// dibangun sebagai gantinya: form admin sekali-pakai, bukan endpoint publik.
//
// Membuat akun LANGSUNG TERVERIFIKASI (skip alur OTP email signup normal - lihat
// signup()/verifyAccount() di service/auth.service.ts) supaya admin tidak perlu akses
// inbox email test untuk membaca kode verifikasi. Selain itu PERSIS meniru hasil akhir
// signup+verify normal: role SELALU 'free' (BUKAN admin - ditegaskan eksplisit sesuai
// permintaan pengguna "hak akses nya jgn admin, user testing biasa", role tidak pernah
// dibaca dari body request), trial 7 hari (TRIAL_DAYS, sama seperti verifyAccount), dan
// portofolio virtual ikut diprovisioning supaya akun tes tidak "setengah jadi" dibanding
// akun yang lewat alur signup biasa.
export async function handleCreateTestUser(
  cookieStore: { get(name: string): { value: string } | undefined },
  body: { email?: unknown; password?: unknown }
): Promise<HttpResult> {
  if (!await isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  if (typeof body.email !== 'string' || !body.email.trim()) {
    throw new ValidationError('Email wajib diisi');
  }
  const email = body.email.trim();
  // Regex email sederhana - konsisten dengan signupSchema (zod z.string().email()) tanpa
  // menyeret dependency zod ke controller ini untuk satu pemeriksaan.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('Email tidak valid');
  }
  if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password minimal ${MIN_PASSWORD_LENGTH} karakter`);
  }

  const existing = await getUserByEmail(email);
  if (existing) throw new ConflictError('Email sudah terdaftar');

  const hashed = await bcrypt.hash(body.password, 10);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
  const userId = crypto.randomUUID();

  await createUser({
    id: userId,
    email,
    password_hash: hashed,
    role: 'free',
    is_verified: true,
    is_pro: false,
    created_at: new Date().toISOString(),
    trial_ends_at: trialEndsAt.toISOString(),
    pro_expires_at: null,
    demo_ends_at: null,
    verification_code: null,
    verification_code_expires: null,
    reset_code: null,
    reset_code_expires: null,
  });
  await provisionPortfolio(userId);

  logger.info('Admin create-test-user', { email, userId });
  return { status: 200, body: { email, userId, trialEndsAt: trialEndsAt.toISOString() } };
}

export async function handleGetProStatus(
  cookieStore: { get(name: string): { value: string } | undefined },
  query: { email?: unknown }
): Promise<HttpResult> {
  if (!await isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  if (typeof query.email !== 'string' || !query.email) {
    throw new ValidationError('email wajib diisi');
  }
  const user = await getUserByEmail(query.email);
  if (!user) throw new NotFoundError('User tidak ditemukan');

  // Hanya tiga field - JANGAN kembalikan objek user apa adanya, di dalamnya ada
  // password_hash, verification_code, dan reset_code.
  return {
    status: 200,
    body: { email: user.email, isPro: user.is_pro, proExpiresAt: user.pro_expires_at ?? null },
  };
}

const MIN_ADMIN_SECRET_LENGTH = 12;
const MAX_ADMIN_SECRET_LENGTH = 128;

export async function handleChangeAdminSecret(
  cookieStore: { get(name: string): { value: string } | undefined },
  body: { currentKey?: unknown; newKey?: unknown }
): Promise<HttpResult> {
  if (!await isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  if (typeof body.currentKey !== 'string' || !body.currentKey || typeof body.newKey !== 'string') {
    throw new ValidationError('Password saat ini dan password baru wajib diisi');
  }
  if (body.newKey.length < MIN_ADMIN_SECRET_LENGTH) {
    throw new ValidationError(`Password baru minimal ${MIN_ADMIN_SECRET_LENGTH} karakter`);
  }
  if (body.newKey.length > MAX_ADMIN_SECRET_LENGTH) {
    throw new ValidationError(`Password baru maksimal ${MAX_ADMIN_SECRET_LENGTH} karakter`);
  }
  if (!(await verifyAdminSecret(body.currentKey))) {
    throw new ValidationError('Password saat ini salah');
  }
  const newHash = await bcrypt.hash(body.newKey, 10);
  await setAdminSecretHash(newHash);
  logger.info('Admin secret diganti');
  return { status: 200, body: { success: true } };
}
