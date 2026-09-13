import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { VERIFICATION_CODE_TTL_MIN } from '../../constants/user.constants';

/**
 * Penjaga email OTP: header Reply-To, isi copy, dan invarian keamanan.
 *
 * Latar belakang nyata (13 September 2026): bounce message berisi kode OTP telanjang
 * ditemukan duduk di INBOX no-reply@sahamlens.id. Penyebabnya pendaftaran dengan
 * alamat @sahamlens.id yang tidak ada - MTA menolak lalu mengembalikan SELURUH isi
 * email ke pengirim. Validator sekarang menolak domain sendiri (auth.validator.test.ts),
 * dan email-nya sendiri diperbaiki supaya balasan pengguna sampai ke manusia.
 */

const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
  createTransport: () => ({ sendMail: sendMailMock }),
}));

vi.mock('../../../../shared/logger/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  sendMailMock.mockClear();
  process.env.SMTP_HOST = 'smtp.test.invalid';
  process.env.SMTP_PORT = '465';
  process.env.SMTP_EMAIL = 'no-reply@sahamlens.id';
  process.env.SMTP_PASSWORD = 'dummy-not-a-real-secret';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('email OTP — header dan tujuan balasan', () => {
  it('mengarahkan balasan ke support@, bukan ke no-reply@', async () => {
    const { sendVerificationEmail } = await import('../email.repository');
    await sendVerificationEmail('budi@gmail.com', '123456');

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const sent = sendMailMock.mock.calls[0][0];
    // Tanpa Reply-To, balasan pengguna mendarat di mailbox yang tidak dibaca siapa pun.
    expect(sent.replyTo).toBe('support@sahamlens.id');
    expect(sent.from).toContain('no-reply@sahamlens.id');
    expect(sent.to).toBe('budi@gmail.com');
  });

  it('mencantumkan alamat bantuan di badan teks dan HTML', async () => {
    const { sendResetPasswordEmail } = await import('../email.repository');
    await sendResetPasswordEmail('siti@yahoo.co.id', '654321');

    const sent = sendMailMock.mock.calls[0][0];
    for (const body of [sent.text, sent.html]) {
      expect(body).toContain('support@sahamlens.id');
      expect(body).toContain('admin@sahamlens.id');
    }
  });
});

describe('email OTP — copy yang memberi tahu pengguna apa yang harus dilakukan', () => {
  it('menyebut masa berlaku yang SAMA dengan konstanta TTL', async () => {
    const { sendVerificationEmail } = await import('../email.repository');
    await sendVerificationEmail('budi@gmail.com', '123456');

    const sent = sendMailMock.mock.calls[0][0];
    // Kalau TTL diubah di konstanta tapi copy-nya tidak, pengguna diberi tahu angka yang
    // salah - dan mereka akan menyimpulkan aplikasinya rusak, bukan kodenya kedaluwarsa.
    expect(sent.text).toContain(`${VERIFICATION_CODE_TTL_MIN} menit`);
    expect(sent.html).toContain(`${VERIFICATION_CODE_TTL_MIN} menit`);
  });

  it('email reset menegaskan kata sandi tidak berubah bila tidak diminta', async () => {
    const { sendResetPasswordEmail } = await import('../email.repository');
    await sendResetPasswordEmail('siti@yahoo.co.id', '654321');

    const sent = sendMailMock.mock.calls[0][0];
    // Penerima yang tidak meminta reset perlu tahu ia tidak harus bertindak apa pun.
    expect(sent.text.toLowerCase()).toContain('kata sandi anda tidak berubah');
    expect(sent.subject).toContain('Reset Kata Sandi');
  });

  it('kedua template memuat kode dan memperingatkan agar tidak dibagikan', async () => {
    const mod = await import('../email.repository');
    const cases: Array<[(e: string, c: string) => Promise<void>, string]> = [
      [mod.sendVerificationEmail, '111222'],
      [mod.sendResetPasswordEmail, '333444'],
    ];
    for (const [fn, code] of cases) {
      sendMailMock.mockClear();
      await fn('budi@gmail.com', code);
      const sent = sendMailMock.mock.calls[0][0];
      expect(sent.text).toContain(code);
      expect(sent.html).toContain(code);
      expect(sent.text.toLowerCase()).toContain('jangan berikan kode ini');
    }
  });
});

describe('email OTP — invarian keamanan H5 (kode tidak boleh masuk log production)', () => {
  it('tidak mencetak kode OTP ke logger saat NODE_ENV=production', async () => {
    const prev = process.env.NODE_ENV;
    // @ts-expect-error menulis NODE_ENV untuk menguji cabang production
    process.env.NODE_ENV = 'production';
    vi.resetModules();

    const { logger } = await import('../../../../shared/logger/logger');
    const { sendVerificationEmail } = await import('../email.repository');
    await sendVerificationEmail('budi@gmail.com', '987654');

    const logged = JSON.stringify(
      [logger.info, logger.warn, logger.error, logger.debug].flatMap(
        (fn) => (fn as unknown as { mock: { calls: unknown[][] } }).mock.calls,
      ),
    );
    // Kode yang tercetak ke log production bisa dibaca siapa pun dengan akses log,
    // artinya takeover akun. Ini temuan H5 di audit - jangan dilepas.
    expect(logged).not.toContain('987654');

    // @ts-expect-error memulihkan NODE_ENV
    process.env.NODE_ENV = prev;
  });

  /**
   * Gerbang pemindai sumber: pastikan alamat bantuan memang konstanta, bukan literal
   * yang tersebar. Memakai stripComments supaya komentar penjelas di berkas ini sendiri
   * tidak ikut dihitung - jebakan yang sudah tercatat di CLAUDE.md §2.
   */
  it('alamat bantuan didefinisikan sebagai konstanta tunggal', () => {
    const file = path.join(process.cwd(), 'modules/user/repository/email.repository.ts');
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(src).toContain("const SUPPORT_EMAIL = 'support@sahamlens.id'");
    expect(src).toContain("const ADMIN_EMAIL = 'admin@sahamlens.id'");

    // Penjaga jumlah: kalau pemindainya rusak, angka ini jatuh dan test ini yang
    // memberi tahu - bukan lolos diam-diam (CLAUDE.md §2).
    const refs = src.match(/\$\{SUPPORT_EMAIL\}|SUPPORT_EMAIL/g) ?? [];
    expect(refs.length).toBeGreaterThan(3);
  });
});
