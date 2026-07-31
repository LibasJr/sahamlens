export type { SessionPayload } from '../../../shared/auth/jwt';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  is_verified: boolean;
  is_pro: boolean;
  created_at: string;
  trial_ends_at: string | null;
  demo_ends_at: string | null;
  verification_code: string | null;
  reset_code: string | null;
  reset_code_expires: string | null;
}

export interface DemoSession {
  id: number;
  username: string;
  role: 'free' | 'pro' | 'admin';
}

export interface TelegramAuthData {
  id: string;
  first_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
  [key: string]: string | undefined;
}
