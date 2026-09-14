import bcrypt from 'bcryptjs';
import { getUserByEmail, updateUser } from '../repository/user.repository';
import { sendResetPasswordEmail } from '../repository/email.repository';
import { generateOtp } from '../utils/otp-generator';
import { RESET_CODE_TTL_MIN } from '../constants/user.constants';
import { InvalidResetCodeError, ResetCodeExpiredError } from '../types/user.errors';
import { timingSafeStringEqual } from '../../../shared/security/timing-safe-equal';
import type { ForgotPasswordInput, ResetPasswordInput } from '../validator/auth.validator';
import { clearResetOtpAttempts, isResetOtpAttemptBlocked, recordResetOtpFailure } from '../../../shared/security/otp-attempt-limiter';
import { clearResetSendQuota, consumeResetSendQuota } from '../../../shared/security/otp-send-limiter';

export async function requestPasswordReset(input: ForgotPasswordInput, ip: string): Promise<void> {
  // Kuota pengiriman dihitung SEBELUM pencarian user, dan memakai email yang diminta
  // apa adanya. Menghitungnya hanya untuk email terdaftar membuat waktu tanggap
  // berbeda antara email dikenal dan tidak - itu membocorkan keanggotaan lewat
  // saluran samping, persis yang dihindari balasan generik di controller.
  const quota = await consumeResetSendQuota(input.email, ip);
  if (!quota.allowed) {
    // Diam, bukan galat: controller tetap membalas sukses generik. Membalas 429 di
    // sini akan memberi tahu penyerang bahwa email itu sedang dibatasi - yang berarti
    // email itu ada.
    return;
  }

  const user = await getUserByEmail(input.email);
  // Sengaja tidak membocorkan apakah email terdaftar atau tidak - kalau user null,
  // diamkan saja (controller tetap balas "sukses" generik ke klien).
  if (!user) return;

  const resetCode = generateOtp();
  const resetCodeExpires = new Date(Date.now() + RESET_CODE_TTL_MIN * 60 * 1000).toISOString();

  await updateUser(user.id, { reset_code: resetCode, reset_code_expires: resetCodeExpires });

  // PENTING: penghitung percobaan TIDAK dibersihkan di sini.
  //
  // Sebelumnya baris ini memanggil `clearResetOtpAttempts(user.email)`, dan itu
  // membuat pembatas percobaan bisa diakali seluruhnya: tebak 4 kali, minta OTP baru,
  // penghitung kembali nol, tebak 4 kali lagi - tanpa batas. Ruang kode hanya 900.000
  // kombinasi, jadi itu bukan serangan teoretis.
  //
  // Penghitung percobaan sekarang HANYA dibersihkan setelah reset benar-benar
  // berhasil, atau habis sendiri ketika jendelanya lewat.

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
  // Alur yang tuntas tidak boleh menghukum pengguna: kedua penghitung dibersihkan
  // HANYA di sini - setelah kode terbukti benar dan password benar-benar berganti.
  await clearResetOtpAttempts(input.email);
  await clearResetSendQuota(input.email);
}
