import { getSession } from '../../../shared/auth/session';
import { SESSION_COOKIE, DEMO_SESSION_COOKIE } from '../../../shared/constants/cookie-names';
import { parseOrThrow } from '../../../shared/validation/parse-or-throw';
import { loginSchema, signupSchema, verifySchema, forgotPasswordSchema, resetPasswordSchema } from '../validator/auth.validator';
import { login, signup, verifyAccount, type AuthSessionResult } from '../service/auth.service';
import { requestPasswordReset, resetPassword } from '../service/password-reset.service';
import type { HttpResult } from '../../../shared/types/http-result.types';
import { getUserById } from '../repository/user.repository';
import { getActiveUsers } from '../../../shared/auth/presence';

function sessionCookies(result: AuthSessionResult) {
  return [
    {
      name: SESSION_COOKIE,
      value: result.token,
      options: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: result.maxAgeSec },
    },
    // Kompatibilitas mundur dengan sistem portofolio demo lama (lihat app/api/portfolio/*).
    {
      name: DEMO_SESSION_COOKIE,
      value: JSON.stringify({ id: result.userId, username: result.email, role: result.role }),
      options: { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 },
    },
  ];
}

export async function handleLogin(rawBody: unknown): Promise<HttpResult> {
  const input = parseOrThrow(loginSchema, rawBody);
  const result = await login(input);
  return { status: 200, body: { success: true, role: result.role }, cookiesToSet: sessionCookies(result) };
}

export async function handleSignup(rawBody: unknown): Promise<HttpResult> {
  const input = parseOrThrow(signupSchema, rawBody);
  await signup(input);
  return { status: 200, body: { success: true, message: 'Kode verifikasi telah dikirim ke email Anda.' } };
}

export async function handleVerify(rawBody: unknown): Promise<HttpResult> {
  const input = parseOrThrow(verifySchema, rawBody);
  const result = await verifyAccount(input);
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
  return { status: 200, body: { success: true }, cookiesToClear: [SESSION_COOKIE, DEMO_SESSION_COOKIE] };
}

export async function handleMe(): Promise<HttpResult> {
  const session = await getSession();
  if (!session) return { status: 401, body: { authenticated: false } };
  return { status: 200, body: { authenticated: true, user: session } };
}

export async function handleGetProfile(): Promise<HttpResult> {
  const session = await getSession();
  if (!session) return { status: 401, body: { error: 'Belum login' } };

  const user = await getUserById(session.id);
  if (!user) return { status: 401, body: { error: 'Belum login' } };

  const body: Record<string, unknown> = {
    email: user.email,
    role: user.role,
    isPro: user.is_pro,
    isVerified: user.is_verified,
    trialEndsAt: user.trial_ends_at,
    createdAt: user.created_at,
  };

  if (user.role === 'admin') {
    body.activeUsers = await getActiveUsers();
  }

  return { status: 200, body };
}
