import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Test ini menyerang alur reset password seperti penyerang, bukan memeriksa
 * bahwa fungsinya "terpanggil". Yang dikunci adalah SIFAT keamanannya.
 */

const mockUser = {
  id: 'u1',
  email: 'korban@example.com',
  reset_code: '123456',
  reset_code_expires: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  password_hash: 'lama',
};

const getUserByEmail = vi.fn();
const updateUser = vi.fn();
const sendResetPasswordEmail = vi.fn();

vi.mock('../../repository/user.repository', () => ({
  getUserByEmail: (...a: unknown[]) => getUserByEmail(...a),
  updateUser: (...a: unknown[]) => updateUser(...a),
}));
vi.mock('../../repository/email.repository', () => ({
  sendResetPasswordEmail: (...a: unknown[]) => sendResetPasswordEmail(...a),
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hash-baru') } }));

// Limiter dibiarkan memakai implementasi ASLI (jalur Map dalam proses, karena
// REDIS_URL tidak diset di test). Mengganti limiter dengan tiruan akan membuat test
// ini menguji tiruannya sendiri, bukan perilaku yang sesungguhnya dipakai produksi.
import { requestPasswordReset, resetPassword } from '../password-reset.service';
import {
  isResetOtpAttemptBlocked,
  clearResetOtpAttempts,
  RESET_OTP_MAX_ATTEMPTS,
} from '../../../../shared/security/otp-attempt-limiter';
import {
  clearResetSendQuota,
  RESET_SEND_MAX_PER_ACCOUNT,
  RESET_SEND_MAX_PER_IP,
} from '../../../../shared/security/otp-send-limiter';

const EMAIL = 'korban@example.com';

// Setiap test memakai IP yang BERBEDA.
//
// `clearResetSendQuota` sengaja hanya membersihkan kuota akun, bukan kuota IP:
// kalau satu reset yang berhasil ikut memulihkan jatah IP, penyerang cukup
// menuntaskan satu reset atas akunnya sendiri untuk mengembalikan jatah
// membanjiri korban lain dari alamat yang sama.
//
// Jadi isolasi antar-test dikerjakan di sisi test - bukan dengan melemahkan
// perilaku produksi demi kenyamanan test.
let ipSeq = 0;
function freshIp(): string {
  ipSeq += 1;
  return `10.77.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
}

beforeEach(async () => {
  vi.clearAllMocks();
  getUserByEmail.mockResolvedValue({ ...mockUser });
  await clearResetOtpAttempts(EMAIL);
  await clearResetSendQuota(EMAIL);
});

describe('001 - permintaan OTP baru tidak boleh mengakali pembatas percobaan', () => {
  it('SERANGAN: tebak sampai terblokir, minta OTP baru, penghitung TETAP terblokir', async () => {
    // Penyerang menghabiskan jatah percobaan dengan kode salah.
    for (let i = 0; i < RESET_OTP_MAX_ATTEMPTS; i += 1) {
      await expect(
        resetPassword({ email: EMAIL, code: '000000', newPassword: 'PasswordBaru123!' } as never),
      ).rejects.toThrow();
    }
    expect(await isResetOtpAttemptBlocked(EMAIL)).toBe(true);

    // Inti kerentanan lama: meminta OTP baru mengembalikan penghitung ke nol,
    // sehingga jatah menebak bisa diperbarui tanpa batas.
    await requestPasswordReset({ email: EMAIL } as never, freshIp());

    expect(await isResetOtpAttemptBlocked(EMAIL)).toBe(true);
  });

  it('reset yang BERHASIL membersihkan penghitung - pengguna sah tidak terhukum', async () => {
    await resetPassword({ email: EMAIL, code: '000000', newPassword: 'PasswordBaru123!' } as never)
      .catch(() => undefined);
    expect(await isResetOtpAttemptBlocked(EMAIL)).toBe(false);

    await resetPassword({ email: EMAIL, code: '123456', newPassword: 'PasswordBaru123!' } as never);

    expect(await isResetOtpAttemptBlocked(EMAIL)).toBe(false);
    expect(updateUser).toHaveBeenCalledWith('u1', expect.objectContaining({
      reset_code: null,
      reset_code_expires: null,
    }));
  });
});

describe('001 - pembatas pengiriman OTP (email bombing)', () => {
  it('pengiriman berhenti setelah batas per akun tercapai', async () => {
    const ip = freshIp();
    for (let i = 0; i < RESET_SEND_MAX_PER_ACCOUNT; i += 1) {
      await requestPasswordReset({ email: EMAIL } as never, ip);
    }
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(RESET_SEND_MAX_PER_ACCOUNT);

    // Permintaan keempat: tidak ada email baru, dan reset_code korban tidak diaduk.
    await requestPasswordReset({ email: EMAIL } as never, ip);
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(RESET_SEND_MAX_PER_ACCOUNT);
  });

  it('berganti IP TIDAK memulihkan kuota akun', () => {
    // Batas per akun harus mengikat lintas sumber, kalau tidak botnet meniadakannya.
    return (async () => {
      for (let i = 0; i < RESET_SEND_MAX_PER_ACCOUNT; i += 1) {
        await requestPasswordReset({ email: EMAIL } as never, freshIp());
      }
      sendResetPasswordEmail.mockClear();

      await requestPasswordReset({ email: EMAIL } as never, freshIp());
      expect(sendResetPasswordEmail).not.toHaveBeenCalled();
    })();
  });

  it('email dinormalkan - huruf besar dan spasi berbagi satu kuota', async () => {
    const ip = freshIp();
    for (let i = 0; i < RESET_SEND_MAX_PER_ACCOUNT; i += 1) {
      await requestPasswordReset({ email: EMAIL } as never, ip);
    }
    sendResetPasswordEmail.mockClear();

    await requestPasswordReset({ email: '  KORBAN@Example.COM  ' } as never, ip);
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('kuota habis tetap DIAM - tidak membocorkan bahwa email terdaftar', async () => {
    // Alur ini tidak boleh melempar. Galat yang bocor ke klien membedakan email
    // terdaftar dari yang tidak, meniadakan balasan generik di controller.
    const ip = freshIp();
    for (let i = 0; i < RESET_SEND_MAX_PER_ACCOUNT + 2; i += 1) {
      await expect(
        requestPasswordReset({ email: EMAIL } as never, ip),
      ).resolves.toBeUndefined();
    }
  });

  it('email tidak terdaftar tetap memakai kuota - menutup pembedaan lewat waktu tanggap', async () => {
    getUserByEmail.mockResolvedValue(null);
    const ip = freshIp();
    for (let i = 0; i < RESET_SEND_MAX_PER_ACCOUNT; i += 1) {
      await requestPasswordReset({ email: 'entah@example.com' } as never, ip);
    }

    // Kuota email asing sudah habis; pencarian user tidak lagi dijalankan.
    getUserByEmail.mockClear();
    await requestPasswordReset({ email: 'entah@example.com' } as never, ip);
    expect(getUserByEmail).not.toHaveBeenCalled();

    await clearResetSendQuota('entah@example.com');
  });
});

describe('001 - properti yang tidak boleh ikut berubah', () => {
  it('kode kedaluwarsa ditolak', async () => {
    getUserByEmail.mockResolvedValue({
      ...mockUser,
      reset_code_expires: new Date(Date.now() - 1000).toISOString(),
    });
    await expect(
      resetPassword({ email: EMAIL, code: '123456', newPassword: 'PasswordBaru123!' } as never),
    ).rejects.toThrow();
  });

  it('OTP dibuat memakai CSPRNG, bukan Math.random', async () => {
    // Penjaga regresi: ruang kode 900.000 kombinasi hanya aman selama kodenya
    // tidak bisa diprediksi.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../utils/otp-generator.ts', import.meta.url), 'utf8'));

    // Komentar dibuang dulu (CLAUDE.md §2). Berkas itu MENJELASKAN dirinya dengan
    // menyebut Math.random di komentar - mencocokkan teks mentah membuat gerbang ini
    // merah karena prosa, bukan karena kode.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    expect(code).toContain('crypto.randomInt');
    expect(code).not.toContain('Math.random');
  });
});

describe('001 - batas per IP (satu mesin membanjiri banyak akun)', () => {
  it('satu IP berhenti melayani setelah batas IP tercapai, walau tiap akun berbeda', async () => {
    const ip = freshIp();

    // Tiap akun punya kuota akunnya sendiri yang masih penuh, jadi yang menahan
    // di sini HARUS batas IP - bukan batas akun.
    for (let i = 0; i < RESET_SEND_MAX_PER_IP; i += 1) {
      await requestPasswordReset({ email: `korban${i}@example.com` } as never, ip);
    }
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(RESET_SEND_MAX_PER_IP);

    sendResetPasswordEmail.mockClear();
    await requestPasswordReset({ email: 'korban-baru@example.com' } as never, ip);
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();

    for (let i = 0; i < RESET_SEND_MAX_PER_IP; i += 1) {
      await clearResetSendQuota(`korban${i}@example.com`);
    }
    await clearResetSendQuota('korban-baru@example.com');
  });

  it('IP lain tidak ikut terblokir', async () => {
    const ipJahat = freshIp();
    for (let i = 0; i < RESET_SEND_MAX_PER_IP + 1; i += 1) {
      await requestPasswordReset({ email: `spam${i}@example.com` } as never, ipJahat);
    }

    sendResetPasswordEmail.mockClear();
    await requestPasswordReset({ email: 'orang-lain@example.com' } as never, freshIp());
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(1);

    for (let i = 0; i < RESET_SEND_MAX_PER_IP + 1; i += 1) {
      await clearResetSendQuota(`spam${i}@example.com`);
    }
    await clearResetSendQuota('orang-lain@example.com');
  });
});
