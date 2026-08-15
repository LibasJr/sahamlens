import { getSession, checkProAccess } from '../../../shared/auth/session';
import { SESSION_COOKIE, ADMIN_COOKIE, ADMIN_BADGE_COOKIE, ROLE_BADGE_COOKIE } from '../../../shared/constants/cookie-names';
import { parseOrThrow } from '../../../shared/validation/parse-or-throw';
import { loginSchema, signupSchema, verifySchema, forgotPasswordSchema, resetPasswordSchema } from '../validator/auth.validator';
import { login, signup, verifyAccount, type AuthSessionResult } from '../service/auth.service';
import { requestPasswordReset, resetPassword } from '../service/password-reset.service';
import type { HttpResult } from '../../../shared/types/http-result.types';
import { getUserById } from '../repository/user.repository';
import { recordAuthEvent } from '../repository/user.repository';
import { getActiveUsers } from '../../../shared/auth/presence';
import type { AuthRequestMeta } from '../../../shared/security/auth-request-meta';
import { logger } from '../../../shared/logger/logger';

function sessionCookies(result: AuthSessionResult) {
  return [
    {
      name: SESSION_COOKIE,
      value: result.token,
      options: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: result.maxAgeSec },
    },
  ];
}

async function recordAuthEventSafely(input: Parameters<typeof recordAuthEvent>[0]): Promise<void> {
  try {
    await recordAuthEvent(input);
  } catch (error) {
    // Audit membantu investigasi, tetapi gangguan tabel audit tidak boleh membuat
    // pengguna gagal daftar atau login.
    logger.warn('Gagal menyimpan audit autentikasi', { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function handleLogin(rawBody: unknown, requestMeta?: AuthRequestMeta): Promise<HttpResult> {
  const input = parseOrThrow(loginSchema, rawBody);
  const result = await login(input);
  if (requestMeta) {
    await recordAuthEventSafely({ userId: result.userId, email: result.email, eventType: 'login', requestMeta });
  }
  return { status: 200, body: { success: true, role: result.role }, cookiesToSet: sessionCookies(result) };
}

export async function handleSignup(rawBody: unknown, requestMeta?: AuthRequestMeta): Promise<HttpResult> {
  const input = parseOrThrow(signupSchema, rawBody);
  const created = await signup(input);
  if (requestMeta) {
    await recordAuthEventSafely({ userId: created.userId, email: created.email, eventType: 'signup', requestMeta });
  }
  return { status: 200, body: { success: true, message: 'Kode verifikasi telah dikirim ke email Anda.' } };
}

export async function handleVerify(rawBody: unknown, requestMeta?: AuthRequestMeta): Promise<HttpResult> {
  const input = parseOrThrow(verifySchema, rawBody);
  const result = await verifyAccount(input);
  if (requestMeta) {
    await recordAuthEventSafely({ userId: result.userId, email: result.email, eventType: 'verify', requestMeta });
  }
  return { status: 200, body: { success: true, message: 'Verifikasi berhasil' }, cookiesToSet: sessionCookies(result) };
}

export async function handleForgotPassword(rawBody: unknown): Promise<HttpResult> {
  const input = parseOrThrow(forgotPasswordSchema, rawBody);
  await requestPasswordReset(input);
  // Selalu balas sukses generik - tidak membocorkan apakah email terdaftar.
  return { status: 200, body: { success: true, message: 'Jika email terdaftar, kode reset akan dikirim ke email Anda.' } };
}

export async function handleResetPassword(rawBody: unknown): Promise<HttpResult> {
  const input = parseOrThrow(resetPasswordSchema, rawBody);
  await resetPassword(input);
  return { status: 200, body: { success: true, message: 'Password berhasil diubah. Silakan login.' } };
}

export async function handleLogout(): Promise<HttpResult> {
  return { status: 200, body: { success: true }, cookiesToClear: [SESSION_COOKIE, ADMIN_COOKIE, ADMIN_BADGE_COOKIE, ROLE_BADGE_COOKIE, 'sahamlens_demo_session'] };
}

export async function handleMe(): Promise<HttpResult> {
  const session = await getSession();
  if (!session) return { status: 401, body: { authenticated: false } };
  return {
    status: 200,
    body: {
      authenticated: true,
      user: {
        id: session.id,
        email: session.email,
        role: session.role,
        is_pro: Boolean(session.is_pro),
        trial_ends_at: session.trial_ends_at ?? null,
        pro_expires_at: session.pro_expires_at ?? null,
      },
    },
  };
}

export async function handleGetProfile(): Promise<HttpResult> {
  const session = await getSession();
  if (!session) return { status: 401, body: { error: 'Belum login' } };

  const user = await getUserById(session.id);
  if (!user) return { status: 401, body: { error: 'Belum login' } };

  // pro_expires_at WAJIB ikut - tanpa itu hasProAccess di sini bilang "Pro" padahal
  // gerbang yang sama menolaknya di route lain, dan pengguna melihat status yang
  // bertentangan dengan yang ia alami.
  const hasProAccess = checkProAccess({
    id: user.id,
    email: user.email,
    role: user.role,
    is_pro: user.is_pro,
    trial_ends_at: user.trial_ends_at,
    pro_expires_at: user.pro_expires_at,
  });

  const body: Record<string, unknown> = {
    email: user.email,
    role: user.role,
    isPro: user.is_pro,
    hasProAccess,
    isVerified: user.is_verified,
    trialEndsAt: user.trial_ends_at,
    proExpiresAt: user.pro_expires_at ?? null,
    createdAt: user.created_at,
  };

  if (user.role === 'admin') {
    const allActive = await getActiveUsers();
    body.activeUsers = allActive.filter((u) => u.id !== user.id);
  }

  return { status: 200, body };
}
