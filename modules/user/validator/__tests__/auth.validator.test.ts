import { describe, it, expect } from 'vitest';
import { loginSchema, signupSchema, verifySchema, resetPasswordSchema } from '../auth.validator';

describe('auth.validator', () => {
  describe('loginSchema', () => {
    it('menerima email dan password yang valid', () => {
      const result = loginSchema.safeParse({ email: 'user@test.com', password: 'rahasia123' });
      expect(result.success).toBe(true);
    });

    it('menolak email kosong', () => {
      const result = loginSchema.safeParse({ email: '', password: 'rahasia123' });
      expect(result.success).toBe(false);
    });

    it('menolak password kosong', () => {
      const result = loginSchema.safeParse({ email: 'user@test.com', password: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('signupSchema', () => {
    it('menolak email dengan format tidak valid', () => {
      const result = signupSchema.safeParse({ email: 'bukan-email', password: '123456' });
      expect(result.success).toBe(false);
    });

    it('menolak password kurang dari 8 karakter', () => {
      const result = signupSchema.safeParse({ email: 'user@test.com', password: '1234567' });
      expect(result.success).toBe(false);
    });

    it('menerima email dan password valid', () => {
      const result = signupSchema.safeParse({ email: 'user@test.com', password: '12345678' });
      expect(result.success).toBe(true);
    });

    it('menolak domain contoh yang tidak dapat menerima verifikasi', () => {
      expect(signupSchema.safeParse({ email: 'smtp-diagnostic-check@example.com', password: '12345678' }).success).toBe(false);
    });

    it('menolak honeypot yang terisi', () => {
      expect(signupSchema.safeParse({ email: 'user@test.com', password: '12345678', website: 'https://bot.invalid' }).success).toBe(false);
    });

    /**
     * Bounce dari MTA mengembalikan SELURUH isi email yang gagal terkirim, termasuk kode
     * OTP telanjang, ke mailbox pengirim. 11 September 2026 seseorang mendaftar dengan
     * alamat @sahamlens.id yang tidak ada; bounce-nya ditemukan duduk di INBOX no-reply@
     * dengan kode verifikasi terbaca jelas.
     *
     * Perlindungan H5 (OTP tidak pernah masuk log production) tidak menutup jalur ini.
     */
    it('menolak pendaftaran dengan domain SahamLens sendiri', () => {
      const result = signupSchema.safeParse({ email: 'auditor@sahamlens.id', password: '12345678' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(JSON.stringify(result.error.issues)).toContain('alamat email pribadi');
      }
    });

    it('menolak domain sendiri tanpa peduli huruf besar-kecil dan spasi', () => {
      // Tanpa normalisasi, `Admin@SahamLens.ID ` lolos dan bounce-nya tetap terjadi.
      for (const email of ['Admin@SahamLens.ID', '  staf@SAHAMLENS.id  ', 'x@Sahamlens.Id']) {
        expect(signupSchema.safeParse({ email: email.trim(), password: '12345678' }).success).toBe(false);
      }
    });

    it('tetap menerima domain luar yang sah', () => {
      // Penjaga lingkup: penolakan di atas tidak boleh meluas ke pengguna biasa.
      for (const email of ['budi@gmail.com', 'siti@yahoo.co.id', 'a@sahamlens.com']) {
        expect(signupSchema.safeParse({ email, password: '12345678' }).success).toBe(true);
      }
    });
  });

  describe('verifySchema', () => {
    it('menolak kode verifikasi kosong', () => {
      const result = verifySchema.safeParse({ email: 'user@test.com', code: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    it('menolak password baru kurang dari 8 karakter', () => {
      const result = resetPasswordSchema.safeParse({ email: 'user@test.com', code: '123456', newPassword: '123' });
      expect(result.success).toBe(false);
    });

    it('menerima input lengkap yang valid', () => {
      const result = resetPasswordSchema.safeParse({ email: 'user@test.com', code: '123456', newPassword: 'passwordbaru' });
      expect(result.success).toBe(true);
    });
  });
});
