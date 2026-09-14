import bcrypt from 'bcryptjs';
import { consumeResetCodeAndSetPassword, getUserByEmail, updateUser } from '../repository/user.repository';
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

  // ===========================================================================
  // Pembacaan ini BUKAN gerbang keamanan - ia hanya menentukan pesan galat.
  // ===========================================================================
  // Gerbang yang sesungguhnya adalah `consumeResetCodeAndSetPassword` di bawah,
  // yang memeriksa kode DAN menukarnya dalam satu operasi database.
  //
  // Pembacaan di sini ada supaya dua hal tetap terjaga:
  //   1. Kode yang jelas salah ditolak tanpa membayar biaya bcrypt.
  //   2. Kedaluwarsa tetap bisa dibedakan dari kode salah - kedaluwarsa adalah
  //      kesalahan yang bukan salah pengguna, jadi tidak dihitung sebagai
  //      percobaan gagal.
  //
  // Kalau pembacaan ini dihapus, keamanannya TIDAK berkurang sedikit pun; yang
  // hilang hanya kualitas pesannya. Itu ukuran yang tepat untuk menilai apakah
  // sebuah pembacaan adalah gerbang atau bukan.
  const user = await getUserByEmail(input.email);
  if (!user || !user.reset_code || !timingSafeStringEqual(user.reset_code, input.code)) {
    await recordResetOtpFailure(input.email);
    throw new InvalidResetCodeError();
  }
  if (user.reset_code_expires && new Date(user.reset_code_expires).getTime() < Date.now()) {
    throw new ResetCodeExpiredError();
  }

  const hash = await bcrypt.hash(input.newPassword, 10);

  // ===========================================================================
  // Konsumsi atomic: periksa dan tukar dalam satu pernyataan.
  // ===========================================================================
  // Mengembalikan `false` berarti barisnya TIDAK berubah - dan pada titik ini,
  // setelah pembacaan di atas menyatakan kodenya benar, sebab yang paling mungkin
  // adalah request lain sudah mengonsumsinya lebih dulu. Itu persis perlombaan
  // yang hendak ditutup.
  //
  // Perlakuannya sama dengan kode salah: password TIDAK berubah, percobaan
  // dicatat, pesan tetap generik. Yang kalah dalam perlombaan tidak boleh
  // mendapat perlakuan istimewa hanya karena kodenya sempat benar.
  const consumed = await consumeResetCodeAndSetPassword(input.email, input.code, hash);
  if (!consumed) {
    await recordResetOtpFailure(input.email);
    throw new InvalidResetCodeError();
  }

  // Alur yang tuntas tidak boleh menghukum pengguna: kedua penghitung dibersihkan
  // HANYA di sini - setelah kode terbukti benar dan password benar-benar berganti.
  await clearResetOtpAttempts(input.email);
  await clearResetSendQuota(input.email);
}
