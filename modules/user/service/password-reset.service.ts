import bcrypt from 'bcryptjs';
import { getUserByEmail, updateUser } from '../repository/user.repository';
import { sendResetPasswordEmail } from '../repository/email.repository';
import { generateOtp } from '../utils/otp-generator';
import { RESET_CODE_TTL_MIN } from '../constants/user.constants';
import { InvalidResetCodeError, ResetCodeExpiredError } from '../types/user.errors';
import { timingSafeStringEqual } from '../../../shared/security/timing-safe-equal';
import type { ForgotPasswordInput, ResetPasswordInput } from '../validator/auth.validator';
import { clearResetOtpAttempts, isResetOtpAttemptBlocked, recordResetOtpFailure } from '../../../shared/security/otp-attempt-limiter';

export async function requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
  const user = await getUserByEmail(input.email);
  // Sengaja tidak membocorkan apakah email terdaftar atau tidak - kalau user null,
  // diamkan saja (controller tetap balas "sukses" generik ke klien).
  if (!user) return;

  const resetCode = generateOtp();
  const resetCodeExpires = new Date(Date.now() + RESET_CODE_TTL_MIN * 60 * 1000).toISOString();

  await updateUser(user.id, { reset_code: resetCode, reset_code_expires: resetCodeExpires });
  await clearResetOtpAttempts(user.email);
  await sendResetPasswordEmail(user.email, resetCode);
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  if (await isResetOtpAttemptBlocked(input.email)) {
    // Pesan tetap generik: jangan bocorkan apakah email/code yang benar.
    throw new InvalidResetCodeError();
  }

  const user = await getUserByEmail(input.email);
  if (!user || !user.reset_code || !timingSafeStringEqual(user.reset_code, input.code)) {
    await recordResetOtpFailure(input.email);
    throw new InvalidResetCodeError();
  }
  if (user.reset_code_expires && new Date(user.reset_code_expires).getTime() < Date.now()) {
    throw new ResetCodeExpiredError();
  }

  const hash = await bcrypt.hash(input.newPassword, 10);
  await updateUser(user.id, { password_hash: hash, reset_code: null, reset_code_expires: null });
  await clearResetOtpAttempts(input.email);
}
