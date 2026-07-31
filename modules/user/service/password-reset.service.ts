import bcrypt from 'bcryptjs';
import { getUserByEmail, updateUser } from '../repository/user.repository';
import { sendResetPasswordEmail } from '../repository/email.repository';
import { generateOtp } from '../utils/otp-generator';
import { RESET_CODE_TTL_MIN } from '../constants/user.constants';
import { InvalidResetCodeError, ResetCodeExpiredError } from '../types/user.errors';
import type { ForgotPasswordInput, ResetPasswordInput } from '../validator/auth.validator';

export async function requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
  const user = await getUserByEmail(input.email);
  // Sengaja tidak membocorkan apakah email terdaftar atau tidak - kalau user null,
  // diamkan saja (controller tetap balas "sukses" generik ke klien).
  if (!user) return;

  const resetCode = generateOtp();
  const resetCodeExpires = new Date(Date.now() + RESET_CODE_TTL_MIN * 60 * 1000).toISOString();

  await updateUser(user.id, { reset_code: resetCode, reset_code_expires: resetCodeExpires });
  await sendResetPasswordEmail(user.email, resetCode);
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const user = await getUserByEmail(input.email);
  if (!user || !user.reset_code || user.reset_code !== input.code) {
    throw new InvalidResetCodeError();
  }
  if (user.reset_code_expires && new Date(user.reset_code_expires).getTime() < Date.now()) {
    throw new ResetCodeExpiredError();
  }

  const hash = await bcrypt.hash(input.newPassword, 10);
  await updateUser(user.id, { password_hash: hash, reset_code: null, reset_code_expires: null });
}
