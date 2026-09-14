import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Test ini menyerang alur reset password seperti penyerang, bukan memeriksa
 * bahwa fungsinya "terpanggil". Yang dikunci adalah SIFAT keamanannya.
 */

const mockUser = {
  id: 'u1',
  // Dibiarkan sebagai getter supaya selalu mengikuti EMAIL (unik per run) tanpa
  // bergantung pada urutan deklarasi - mockUser didefinisikan sebelum EMAIL.
  get email() { return EMAIL; },
  reset_code: '123456',
  reset_code_expires: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  password_hash: 'lama',
};

const getUserByEmail = vi.fn();
const updateUser = vi.fn();
const sendResetPasswordEmail = vi.fn();

const consumeResetCodeAndSetPassword = vi.fn();

vi.mock('../../repository/user.repository', () => ({
  getUserByEmail: (...a: unknown[]) => getUserByEmail(...a),
  updateUser: (...a: unknown[]) => updateUser(...a),
  consumeResetCodeAndSetPassword: (...a: unknown[]) => consumeResetCodeAndSetPassword(...a),
}));
vi.mock('../../repository/email.repository', () => ({
  sendResetPasswordEmail: (...a: unknown[]) => sendResetPasswordEmail(...a),
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hash-baru') } }));

// Limiter dibiarkan memakai implementasi ASLI. Mengganti limiter dengan tiruan akan
// membuat test ini menguji tiruannya sendiri, bukan perilaku yang dipakai produksi.
//
// KOREKSI: komentar sebelumnya menyatakan limiter "memakai jalur Map dalam proses
// karena REDIS_URL tidak diset di test". Itu TIDAK benar di mesin pengembang yang
// punya REDIS_URL di lingkungannya - di sana limiter memakai Redis sungguhan, dan
// hitungan kuotanya bertahan 15 menit MELEWATI batas run.
//
// Test ini karena itu tidak boleh mengandalkan state bersih di awal: identitas yang
// dipakai (email dan IP) dibuat unik per run, lihat RUN_ID di bawah.
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

const RUN_ID = `${process.pid}-${Math.floor(Math.random() * 1e6)}`;

/** Email unik per run - kuota akun juga bertahan di Redis antar-run. */
function freshEmail(label: string): string {
  return `${label}-${RUN_ID}@example.com`;
}

const EMAIL = freshEmail('korban');

// Setiap test memakai IP yang BERBEDA.
//
// `clearResetSendQuota` sengaja hanya membersihkan kuota akun, bukan kuota IP:
// kalau satu reset yang berhasil ikut memulihkan jatah IP, penyerang cukup
// menuntaskan satu reset atas akunnya sendiri untuk mengembalikan jatah
// membanjiri korban lain dari alamat yang sama.
//
// Jadi isolasi antar-test dikerjakan di sisi test - bukan dengan melemahkan
// perilaku produksi demi kenyamanan test.
//
// PENTING - kenapa ada entropi per-run di bawah:
//
// Versi pertama memakai urutan deterministik (10.77.0.1, 10.77.0.2, ...). Itu lulus
// saat limiter memakai jalur Map dalam proses, tetapi GAGAL begitu REDIS_URL benar-
// benar terpasang di lingkungan pengembang: kuota bertahan 15 menit di Redis, jadi
// run berikutnya memakai alamat yang jatahnya SUDAH habis oleh run sebelumnya.
//
// Kegagalannya menyesatkan - terbaca seperti pembatas IP rusak, padahal pembatasnya
// bekerja persis sebagaimana mestinya. Yang rusak adalah asumsi test bahwa state-nya
// selalu bersih.
//
// Identitas dibuat unik per proses supaya test tidak pernah mewarisi kuota run lain,
// tanpa perlu melemahkan atau mem-bypass limiter yang sedang diuji.

let ipSeq = 0;
function freshIp(): string {
  ipSeq += 1;
  // DUA oktet diacak per run (62.500 kombinasi), bukan satu (250). Dengan satu
  // oktet, dua run yang berdekatan punya peluang ~0,4% memakai blok IP yang sama
  // dan mewarisi kuota Redis satu sama lain - test keamanan yang gagal sekali
  // dalam dua ratus run akan disebut "flaky" lalu diabaikan.
  const h = Math.abs(hashRun());
  const a = h % 250;
  const b = Math.floor(h / 250) % 250;
  // Satu run tidak pernah memakai lebih dari 250 alamat; kalau sampai lewat,
  // oktet terakhir berputar dan alamatnya berulang - lebih baik berisik daripada
  // diam-diam berbagi kuota.
  if (ipSeq >= 250) throw new Error('freshIp(): melebihi 250 alamat dalam satu run');
  return `10.${a}.${b}.${ipSeq}`;
}

function hashRun(): number {
  let h = 0;
  for (let i = 0; i < RUN_ID.length; i += 1) h = (h * 31 + RUN_ID.charCodeAt(i)) | 0;
  return h;
}


beforeEach(async () => {
  vi.clearAllMocks();
  getUserByEmail.mockResolvedValue({ ...mockUser });
  // Bawaan: konsumsi berhasil. Test yang menguji perlombaan menggantinya dengan
  // simulator yang meniru perilaku atomic Postgres.
  consumeResetCodeAndSetPassword.mockResolvedValue(true);
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
    // Dulu dibuktikan lewat `updateUser`. Sejak V2 butir 004 penukaran kode
    // dilakukan atomic di database, jadi yang dibuktikan sekarang adalah
    // pemanggilan konsumsi atomic itu - dengan kode yang benar.
    expect(consumeResetCodeAndSetPassword).toHaveBeenCalledWith(
      EMAIL,
      '123456',
      expect.any(String),
    );
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

    // Varian DITURUNKAN dari EMAIL, bukan ditulis ulang sebagai teks tetap.
    // Sejak identitas dibuat unik per run (RUN_ID), alamat hardcoded seperti
    // '  KORBAN@Example.COM  ' menunjuk akun yang BERBEDA - kuotanya masih penuh,
    // jadi test lulus/gagal karena alasan yang sama sekali bukan normalisasi.
    const varian = `  ${EMAIL.toUpperCase()}  `;
    await requestPasswordReset({ email: varian } as never, ip);
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
      await requestPasswordReset({ email: freshEmail(`korban${i}`) } as never, ip);
    }
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(RESET_SEND_MAX_PER_IP);

    sendResetPasswordEmail.mockClear();
    await requestPasswordReset({ email: 'korban-baru@example.com' } as never, ip);
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();

    for (let i = 0; i < RESET_SEND_MAX_PER_IP; i += 1) {
      await clearResetSendQuota(freshEmail(`korban${i}`));
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

// ===========================================================================
// V2 butir 004 - konsumsi OTP atomic
// ===========================================================================
describe('004 - OTP hanya boleh dikonsumsi SATU KALI, walau request berbarengan', () => {
  /**
   * Simulator baris database yang meniru perilaku `UPDATE ... WHERE reset_code = $2`.
   *
   * Ini BUKAN mock yang selalu mengiyakan - itu hanya akan menguji tiruannya
   * sendiri. Yang ditiru adalah sifat yang dijamin Postgres: syarat dievaluasi
   * pada keadaan baris TERKINI, dan satu baris hanya bisa diubah satu penulis
   * pada satu waktu. Jadi penulis kedua melihat `reset_code` yang sudah NULL.
   */
  function makeAtomicRow(code: string | null) {
    let resetCode = code;
    let passwordHash = 'lama';
    let writes = 0;
    return {
      consume: async (_email: string, given: string, hash: string) => {
        // Jeda sebelum menulis: memberi kesempatan request lain menyelinap di
        // antara baca dan tulis - persis celah yang dulu ada di service.
        await new Promise((r) => setTimeout(r, 1));
        if (resetCode === null || resetCode !== given) return false;
        resetCode = null;
        passwordHash = hash;
        writes += 1;
        return true;
      },
      get writes() { return writes; },
      get passwordHash() { return passwordHash; },
      get resetCode() { return resetCode; },
    };
  }

  it('SERANGAN: dua request paralel dengan OTP valid yang sama - hanya satu berhasil', async () => {
    const row = makeAtomicRow('123456');
    consumeResetCodeAndSetPassword.mockImplementation(row.consume);

    const results = await Promise.allSettled([
      resetPassword({ email: EMAIL, code: '123456', newPassword: 'PasswordA123!' } as never),
      resetPassword({ email: EMAIL, code: '123456', newPassword: 'PasswordB123!' } as never),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1);
    // Bukti yang sesungguhnya: barisnya hanya ditulis sekali.
    expect(row.writes).toBe(1);
    expect(row.resetCode).toBeNull();
  });

  it('SERANGAN: sepuluh request serentak tetap hanya menghasilkan satu konsumsi', async () => {
    const row = makeAtomicRow('123456');
    consumeResetCodeAndSetPassword.mockImplementation(row.consume);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        resetPassword({ email: EMAIL, code: '123456', newPassword: `Password${i}123!` } as never),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(row.writes).toBe(1);
  });

  it('yang KALAH dalam perlombaan tidak mengubah password dan tetap dapat pesan generik', async () => {
    const row = makeAtomicRow('123456');
    consumeResetCodeAndSetPassword.mockImplementation(row.consume);

    await resetPassword({ email: EMAIL, code: '123456', newPassword: 'PasswordA123!' } as never);
    const hashSetelahMenang = row.passwordHash;

    // Request kedua datang setelahnya dengan kode yang sama - kini sudah dikonsumsi.
    await expect(
      resetPassword({ email: EMAIL, code: '123456', newPassword: 'PasswordB123!' } as never),
    ).rejects.toThrow(/kode|invalid|salah/i);

    expect(row.passwordHash).toBe(hashSetelahMenang);
    expect(row.writes).toBe(1);
  });

  it('konsumsi gagal TIDAK membersihkan penghitung percobaan', async () => {
    // Kalau kegagalan konsumsi tetap membersihkan penghitung, kerentanan 001
    // terbuka lagi lewat pintu belakang.
    consumeResetCodeAndSetPassword.mockResolvedValue(false);

    await expect(
      resetPassword({ email: EMAIL, code: '123456', newPassword: 'PasswordBaru123!' } as never),
    ).rejects.toThrow();

    for (let i = 1; i < RESET_OTP_MAX_ATTEMPTS; i += 1) {
      await expect(
        resetPassword({ email: EMAIL, code: '123456', newPassword: 'PasswordBaru123!' } as never),
      ).rejects.toThrow();
    }
    expect(await isResetOtpAttemptBlocked(EMAIL)).toBe(true);
  });

  it('password TIDAK diubah lewat updateUser lagi - jalur non-atomic sudah mati', async () => {
    // Penjaga regresi struktural: kalau seseorang mengembalikan updateUser ke
    // jalur ini, perlombaan lama hidup kembali tanpa ada test lain yang merah.
    await resetPassword({ email: EMAIL, code: '123456', newPassword: 'PasswordBaru123!' } as never);

    const menulisPassword = updateUser.mock.calls.some(
      (c) => c[1] && Object.prototype.hasOwnProperty.call(c[1], 'password_hash'),
    );
    expect(menulisPassword).toBe(false);
    expect(consumeResetCodeAndSetPassword).toHaveBeenCalledTimes(1);
  });
});
