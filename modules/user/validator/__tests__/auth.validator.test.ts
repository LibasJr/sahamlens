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

    it('menolak password kurang dari 6 karakter', () => {
      const result = signupSchema.safeParse({ email: 'user@test.com', password: '12345' });
      expect(result.success).toBe(false);
    });

    it('menerima email dan password valid', () => {
      const result = signupSchema.safeParse({ email: 'user@test.com', password: '123456' });
      expect(result.success).toBe(true);
    });
  });

  describe('verifySchema', () => {
    it('menolak kode verifikasi kosong', () => {
      const result = verifySchema.safeParse({ email: 'user@test.com', code: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('resetPasswordSchema', () => {
    it('menolak password baru kurang dari 6 karakter', () => {
      const result = resetPasswordSchema.safeParse({ email: 'user@test.com', code: '123456', newPassword: '123' });
      expect(result.success).toBe(false);
    });

    it('menerima input lengkap yang valid', () => {
      const result = resetPasswordSchema.safeParse({ email: 'user@test.com', code: '123456', newPassword: 'passwordbaru' });
      expect(result.success).toBe(true);
    });
  });
});
