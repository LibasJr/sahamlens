import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ForbiddenError, ValidationError, NotFoundError, ConflictError } from '../../../shared/errors/app-error';
import { ADMIN_COOKIE, ADMIN_BADGE_COOKIE, ROLE_BADGE_COOKIE } from '../../../shared/constants/cookie-names';
import { ADMIN_SESSION_MAX_AGE_SECONDS, readAdminToken, signAdminToken } from '../../../shared/auth/admin-token';
import { isAdminFromRequestCookies, getAdminStatsToday, getAdminExportData } from '../service/admin.service';
import { getUserByEmail, updateUser, createUser } from '../repository/user.repository';
import { extendProExpiry } from '../service/pro-expiry.service';
import { getAdminSecretState, setAdminSecretHash } from '../repository/admin-secret.repository';
import { recordAdminAudit } from '../repository/admin-audit.repository';
import { activateProAndReconcilePayment, getPaymentOrderByReference } from '../../payment/repository/payment-order.repository';
import { provisionPortfolio } from '../../portfolio';
import { MIN_PASSWORD_LENGTH } from '../constants/user.constants';
import { logger } from '../../../shared/logger/logger';
import { PRICING_PLANS } from '../../../shared/config/pricing';
import type { HttpResult, CookieToSet } from '../../../shared/types/http-result.types';

// getAdminSecret dipindah dari service/telegram-auth.service.ts (dihapus - login via
// Telegram sudah tidak dipakai) supaya handleAdminLoginByKey tetap jalan.
function getAdminSecret(): string | undefined {
  return process.env.ADMIN_SECRET_KEY;
}

const ADMIN_COOKIE_MAX_AGE = ADMIN_SESSION_MAX_AGE_SECONDS;

async function adminCookies(sessionVersion: number): Promise<CookieToSet[]> {
  const secure = process.env.NODE_ENV === 'production';
  return [
    {
      name: ADMIN_COOKIE,
      value: await signAdminToken(sessionVersion),
      options: { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: ADMIN_COOKIE_MAX_AGE },
    },
    // UI badges are intentionally non-HttpOnly and never authorize a server request.
    { name: ADMIN_BADGE_COOKIE, value: 'true', options: { httpOnly: false, secure, sameSite: 'strict', path: '/', maxAge: ADMIN_COOKIE_MAX_AGE } },
    { name: ROLE_BADGE_COOKIE, value: 'admin', options: { httpOnly: false, secure, sameSite: 'strict', path: '/', maxAge: ADMIN_COOKIE_MAX_AGE } },
  ];
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

type AdminSecretVerification = { ok: true; sessionVersion: number; source: 'DB' | 'BOOTSTRAP_ENV' | 'BREAK_GLASS' } | { ok: false };

/**
 * Normal operation accepts only the bcrypt hash stored in DB. ADMIN_SECRET_KEY is a
 * bootstrap credential when no DB hash exists, and becomes a break-glass credential only
 * when ADMIN_BREAK_GLASS_ENABLED=true. This prevents a forgotten environment secret from
 * remaining a permanent second password forever.
 */
async function verifyAdminSecret(key: string): Promise<AdminSecretVerification> {
  const envSecret = getAdminSecret();
  try {
    const state = await getAdminSecretState();
    if (state.secretHash) {
      const matchesDb = await bcrypt.compare(key, state.secretHash).catch(() => false);
      if (matchesDb) return { ok: true, sessionVersion: state.sessionVersion, source: 'DB' };

      if (process.env.ADMIN_BREAK_GLASS_ENABLED === 'true' && envSecret && timingSafeStringEqual(key, envSecret)) {
        return { ok: true, sessionVersion: state.sessionVersion, source: 'BREAK_GLASS' };
      }
      return { ok: false };
    }

    // First-install bootstrap: once the env credential is used successfully, persist a
    // bcrypt hash immediately. Subsequent logins no longer accept env unless break-glass
    // is explicitly enabled.
    if (envSecret && timingSafeStringEqual(key, envSecret)) {
      const hash = await bcrypt.hash(key, 12);
      const sessionVersion = await setAdminSecretHash(hash);
      return { ok: true, sessionVersion, source: 'BOOTSTRAP_ENV' };
    }
    return { ok: false };
  } catch (err) {
    logger.warn('Gagal verifikasi admin secret lewat DB', { err });
    if (process.env.ADMIN_BREAK_GLASS_ENABLED === 'true' && envSecret && timingSafeStringEqual(key, envSecret)) {
      // v0 is accepted only while the explicit break-glass switch remains enabled.
      return { ok: true, sessionVersion: 0, source: 'BREAK_GLASS' };
    }
    return { ok: false };
  }
}

async function currentAdminTokenJti(cookieStore: { get(name: string): { value: string } | undefined }): Promise<string | null> {
  return (await readAdminToken(cookieStore.get(ADMIN_COOKIE)?.value))?.jti ?? null;
}

async function auditAdmin(
  cookieStore: { get(name: string): { value: string } | undefined } | null,
  action: Parameters<typeof recordAdminAudit>[0]['action'],
  target?: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  const tokenJti = cookieStore ? await currentAdminTokenJti(cookieStore) : null;
  await recordAdminAudit({ action, target, detail, tokenJti }).catch((err) => {
    logger.warn('Gagal tulis admin audit event', { action, err });
  });
}

// Key salah -> 404 (tidak membocorkan bahwa route ini ada).
export async function handleAdminLoginByKey(key: string | null): Promise<HttpResult> {
  if (!key) return { status: 404, body: { error: 'Not found' } };
  const verification = await verifyAdminSecret(key);
  if (!verification.ok) return { status: 404, body: { error: 'Not found' } };
  await auditAdmin(null, 'LOGIN', null, { source: verification.source });
  return {
    status: 302,
    body: null,
    redirectTo: '/dashboard',
    cookiesToSet: await adminCookies(verification.sessionVersion),
  };
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
  body: { email?: unknown; isPro?: unknown; months?: unknown; expiresAt?: unknown; paymentReference?: unknown; reconciliationNote?: unknown }
): Promise<HttpResult> {
  if (!await isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  if (typeof body.email !== 'string' || !body.email || typeof body.isPro !== 'boolean') {
    throw new ValidationError('email dan isPro wajib diisi dengan tipe yang benar');
  }
  const user = await getUserByEmail(body.email);
  if (!user) throw new NotFoundError('User tidak ditemukan');

  const paymentReference = typeof body.paymentReference === 'string' && body.paymentReference.trim()
    ? body.paymentReference.trim()
    : null;
  const reconciliationNote = typeof body.reconciliationNote === 'string' && body.reconciliationNote.trim()
    ? body.reconciliationNote.trim().slice(0, 500)
    : null;
  if (paymentReference && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentReference)) {
    throw new ValidationError('Referensi pembayaran harus berupa UUID yang dibuat SahamLens');
  }
  if (paymentReference && !body.isPro) {
    throw new ValidationError('Referensi pembayaran hanya boleh dipakai saat mengaktifkan Pro');
  }
  let paymentPlanMonths: number | null = null;
  if (paymentReference) {
    const order = await getPaymentOrderByReference(paymentReference);
    if (!order) throw new NotFoundError('Referensi pembayaran tidak ditemukan');
    if (order.email && order.email.toLowerCase() !== body.email.toLowerCase()) {
      throw new ValidationError('Referensi pembayaran tidak cocok dengan email user');
    }
    if (order.status === 'PAID') {
      throw new ConflictError('Referensi pembayaran sudah direkonsiliasi sebagai PAID');
    }
    const plan = PRICING_PLANS.find((candidate) => candidate.id === order.planCode);
    if (!plan) throw new ValidationError('Paket pada referensi pembayaran tidak dikenali oleh katalog saat ini');
    paymentPlanMonths = plan.months;
    if (typeof body.months === 'number' && body.months !== plan.months) {
      throw new ValidationError(`Durasi aktivasi harus mengikuti klaim pembayaran: ${plan.months} bulan`);
    }
    if (typeof body.expiresAt === 'string' && body.expiresAt.trim()) {
      throw new ValidationError('Tanggal kedaluwarsa manual tidak boleh dipakai bersama referensi pembayaran');
    }
  }

  let proExpiresAt: string | null = null;
  if (body.isPro) {
    if (paymentPlanMonths != null) {
      // Durasi entitlement berasal dari order server-side, bukan input admin/browser.
      proExpiresAt = extendProExpiry(user.pro_expires_at ?? null, paymentPlanMonths);
    } else if (typeof body.expiresAt === 'string' && body.expiresAt) {
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
  if (paymentReference) {
    // Entitlement + payment reconciliation are one DB transaction. This is intentionally
    // different from the no-reference admin override path below.
    try {
      await activateProAndReconcilePayment({
        userId: user.id,
        email: body.email,
        proExpiresAt: proExpiresAt!,
        reference: paymentReference,
        adminJti: await currentAdminTokenJti(cookieStore),
        note: reconciliationNote,
      });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'PAYMENT_REFERENCE_NOT_FOUND') throw new NotFoundError('Referensi pembayaran tidak ditemukan');
      if (code === 'PAYMENT_EMAIL_MISMATCH') throw new ValidationError('Referensi pembayaran tidak cocok dengan email user');
      if (code === 'PAYMENT_ALREADY_RECONCILED') throw new ConflictError('Referensi pembayaran sudah direkonsiliasi sebagai PAID');
      throw error;
    }
  } else {
    await updateUser(user.id, { is_pro: body.isPro, pro_expires_at: proExpiresAt });
  }
  logger.info('Admin set-pro', { email: body.email, isPro: body.isPro, proExpiresAt, paymentReference });
  await auditAdmin(cookieStore, 'SET_PRO', body.email, { isPro: body.isPro, proExpiresAt, paymentReference });
  return { status: 200, body: { email: body.email, isPro: body.isPro, proExpiresAt, paymentReference } };
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
// dibaca dari body request), akses pengujian tanpa tanggal akhir, dan
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
  const userId = crypto.randomUUID();

  await createUser({
    id: userId,
    email,
    password_hash: hashed,
    role: 'free',
    is_verified: true,
    is_pro: false,
    created_at: new Date().toISOString(),
    trial_ends_at: null,
    pro_expires_at: null,
    demo_ends_at: null,
    verification_code: null,
    verification_code_expires: null,
    reset_code: null,
    reset_code_expires: null,
  });
  await provisionPortfolio(userId);

  logger.info('Admin create-test-user', { email, userId });
  await auditAdmin(cookieStore, 'CREATE_TEST_USER', email, { userId });
  return { status: 200, body: { email, userId } };
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
  const current = await verifyAdminSecret(body.currentKey);
  if (!current.ok) throw new ValidationError('Password saat ini salah');
  const newHash = await bcrypt.hash(body.newKey, 12);
  const newVersion = await setAdminSecretHash(newHash);
  logger.info('Admin secret diganti', { sessionVersion: newVersion });
  await auditAdmin(cookieStore, 'CHANGE_SECRET', null, { previousVersion: current.sessionVersion, newVersion });
  return { status: 200, body: { success: true }, cookiesToSet: await adminCookies(newVersion) };
}
