import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../constants/user.constants';

const RESERVED_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'invalid', 'localhost']);

function isDeliverableEmailDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  return Boolean(domain) && !RESERVED_EMAIL_DOMAINS.has(domain);
}

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  email: z.string()
    .email('Email tidak valid')
    .refine(isDeliverableEmailDomain, 'Gunakan alamat email yang dapat menerima kode verifikasi'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password minimal ${MIN_PASSWORD_LENGTH} karakter`),
  // Honeypot: tidak terlihat bagi manusia, tetapi bot pengisi formulir generik sering
  // mengisinya. Bukan pengganti CAPTCHA, namun menahan noise otomatis tanpa layanan luar.
  website: z.string().max(0, 'Permintaan pendaftaran tidak valid').optional(),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
});
export type VerifyInput = z.infer<typeof verifySchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Password minimal ${MIN_PASSWORD_LENGTH} karakter`),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
