import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { encrypt } from '../../../shared/auth/jwt';
import { provisionPortfolio } from '../../portfolio';
import { getUserByEmail, createUser, recordSuccessfulLogin, updateUser } from '../repository/user.repository';
import { sendVerificationEmail } from '../repository/email.repository';
import { generateOtp } from '../utils/otp-generator';
import { VERIFICATION_CODE_TTL_MIN } from '../constants/user.constants';
import { InvalidCredentialsError, EmailNotVerifiedError, EmailAlreadyRegisteredError, InvalidVerificationCodeError, VerificationCodeExpiredError } from '../types/user.errors';
import { timingSafeStringEqual } from '../../../shared/security/timing-safe-equal';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error';
import { clearVerifyOtpAttempts, isVerifyOtpAttemptBlocked, recordVerifyOtpFailure } from '../../../shared/security/otp-attempt-limiter';
import type { LoginInput, SignupInput, VerifyInput } from '../validator/auth.validator';

// Hash dummy dipakai saat user tidak ditemukan, supaya waktu respons login mirip
// dengan kasus password salah - mencegah user enumeration lewat timing (temuan M5).
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8x8LJfyMDvBEqNmYSXhkGX0hFqwHqK';

export interface AuthSessionResult {
  token: string;
  maxAgeSec: number;
  role: string;
  userId: string;
  email: string;
}

export async function login(input: LoginInput): Promise<AuthSessionResult> {
  const user = await getUserByEmail(input.email);

  if (!user) {
    await bcrypt.compare(input.password, DUMMY_HASH);
    throw new InvalidCredentialsError();
  }

  // Selalu validasi password lebih dulu. Sebelumnya status EMAIL_NOT_VERIFIED
  // dikembalikan sebelum password dicek, sehingga orang yang hanya tahu sebuah email
  // dapat membedakan akun yang ada-belum-verifikasi dari akun yang tidak ada.
  const isValid = await bcrypt.compare(input.password, user.password_hash);
  if (!isValid) throw new InvalidCredentialsError();

  if (!user.is_verified && user.role !== 'admin') {
    throw new EmailNotVerifiedError();
  }

  // Audit aktivitas tidak boleh membuat login gagal kalau pencatatannya sedang bermasalah.
  try {
    await recordSuccessfulLogin(user.id);
  } catch (error) {
    console.warn('[auth] gagal mencatat login terakhir', error instanceof Error ? error.message : String(error));
  }

  const maxAgeSec = input.remember ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
  const sessionExpires = input.remember ? '30d' : '24h';
  const token = await encrypt(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      is_pro: user.is_pro,
      trial_ends_at: user.trial_ends_at,
      pro_expires_at: user.pro_expires_at,
    },
    sessionExpires
  );

  return { token, maxAgeSec, role: user.role, userId: user.id, email: user.email };
}

export async function signup(input: SignupInput): Promise<{ userId: string; email: string }> {
  const existing = await getUserByEmail(input.email);
  const code = generateOtp();
  const codeExpires = new Date(Date.now() + VERIFICATION_CODE_TTL_MIN * 60 * 1000).toISOString();
  const hashed = await bcrypt.hash(input.password, 10);
  const userId = existing?.id ?? crypto.randomUUID();

  if (existing) {
    if (existing.is_verified) throw new EmailAlreadyRegisteredError();
    await updateUser(existing.id, { password_hash: hashed, verification_code: code, verification_code_expires: codeExpires });
  } else {
    await createUser({
      id: userId,
      email: input.email.trim(),
      password_hash: hashed,
      role: 'free',
      is_verified: false,
      is_pro: false,
      created_at: new Date().toISOString(),
      trial_ends_at: null,
      pro_expires_at: null,
      demo_ends_at: null,
      verification_code: code,
      verification_code_expires: codeExpires,
      reset_code: null,
      reset_code_expires: null,
    });
  }

  await sendVerificationEmail(input.email.trim(), code);
  return { userId, email: input.email.trim() };
}

export async function verifyAccount(input: VerifyInput): Promise<AuthSessionResult> {
  if (await isVerifyOtpAttemptBlocked(input.email)) {
    // Tetap gunakan pesan kode salah yang generik; jangan memberi petunjuk tambahan
    // kepada penyerang bahwa suatu email memang memiliki OTP aktif.
    throw new InvalidVerificationCodeError();
  }

  const user = await getUserByEmail(input.email);
  if (!user) {
    await recordVerifyOtpFailure(input.email);
    throw new InvalidVerificationCodeError();
  }
  if (user.is_verified) throw new ValidationError('Akun sudah terverifikasi');
  if (!user.verification_code || !timingSafeStringEqual(user.verification_code, input.code)) {
    await recordVerifyOtpFailure(input.email);
    throw new InvalidVerificationCodeError();
  }
  if (user.verification_code_expires && new Date(user.verification_code_expires).getTime() < Date.now()) {
    throw new VerificationCodeExpiredError();
  }

  // Fase pengujian belum memiliki tanggal akhir akses. Nilai lama juga dibersihkan
  // oleh migrasi ringan di repository agar sesi lama tidak memunculkan batas semu.
  await updateUser(user.id, { is_verified: true, verification_code: null, verification_code_expires: null, trial_ends_at: null });
  try {
    await recordSuccessfulLogin(user.id);
  } catch (error) {
    console.warn('[auth] gagal mencatat login verifikasi', error instanceof Error ? error.message : String(error));
  }
  await clearVerifyOtpAttempts(user.email);

  // Provisioning portofolio virtual lewat public API modules/portfolio - sebelumnya
  // reach-through langsung ke lib/dbLocal (file JSON), sekarang Postgres sungguhan
  // dengan boundary module yang benar (temuan M4 code review, sekarang tertutup).
  await provisionPortfolio(user.id);

  // Akun baru belum pernah Pro, jadi pro_expires_at null - masa berlakunya baru ada
  // kalau admin mengaktifkan lewat /admin.
  const token = await encrypt({
    id: user.id,
    email: user.email,
    role: user.role,
    is_pro: user.is_pro,
    trial_ends_at: null,
    pro_expires_at: null,
  });

  return { token, maxAgeSec: 24 * 60 * 60, role: user.role, userId: user.id, email: user.email };
}
