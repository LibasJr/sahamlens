import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../constants/user.constants';

const RESERVED_EMAIL_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'invalid', 'localhost']);

/**
 * Domain milik SahamLens sendiri. Pendaftaran dengan alamat di domain ini ditolak.
 *
 * Bukan soal kerapian. 11 September 2026 seseorang mendaftar dengan alamat
 * `@sahamlens.id` yang tidak ada; MTA Hostinger menolaknya (`550 User doesn't exist`)
 * lalu mengembalikan SELURUH isi email ke mailbox pengirim - termasuk kode OTP
 * telanjang. Bounce itu ditemukan duduk di INBOX `no-reply@` saat pemeriksaan
 * 13 September 2026.
 *
 * Perlindungan H5 (lihat email.repository.ts) menutup jalur LOG: OTP tidak pernah
 * dicetak ke log production. Jalur BOUNCE tidak tertutup olehnya - dan hasilnya sama,
 * kode verifikasi tersimpan di tempat yang tidak diperiksa siapa pun.
 *
 * Staf yang butuh akun ber-@sahamlens.id dibuat lewat panel admin
 * (`admin.controller.ts` memanggil `createUser` langsung, tidak melewati skema ini),
 * jadi penolakan di sini tidak memutus jalur sah mana pun.
 *
 * BATAS JUJUR: ini menutup vektor yang TERUKUR, bukan seluruh kelasnya. Alamat salah
 * ketik di domain luar (`budi@gmial.com`) tetap bisa menghasilkan bounce ber-OTP.
 * Mitigasi umumnya bukan validasi - melainkan tidak menaruh kode di body yang bisa
 * dikembalikan, atau pembersihan bounce otomatis. Lihat catatan di docs/operations.
 */
const OWN_MAIL_DOMAINS = new Set(['sahamlens.id']);

function isDeliverableEmailDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  return Boolean(domain) && !RESERVED_EMAIL_DOMAINS.has(domain);
}

function isNotOwnDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  return Boolean(domain) && !OWN_MAIL_DOMAINS.has(domain);
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
    .refine(isDeliverableEmailDomain, 'Gunakan alamat email yang dapat menerima kode verifikasi')
    .refine(isNotOwnDomain, 'Gunakan alamat email pribadi Anda, bukan alamat domain SahamLens'),
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
