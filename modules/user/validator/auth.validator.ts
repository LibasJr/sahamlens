import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../constants/user.constants';

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  email: z.string().email('Email tidak valid'),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password minimal ${MIN_PASSWORD_LENGTH} karakter`),
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
