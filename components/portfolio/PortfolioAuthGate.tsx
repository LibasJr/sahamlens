'use client';

import React from 'react';
import { Wallet } from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { PasswordToggle } from '@/components/ui/PasswordToggle';

interface PortfolioAuthGateProps {
  mode: 'LOGIN' | 'SIGNUP';
  pendingVerification: boolean;
  email: string;
  password: string;
  confirmPassword: string;
  otpCode: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  error: string;
  loading: boolean;
  onModeChange: (mode: 'LOGIN' | 'SIGNUP') => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onOtpCodeChange: (value: string) => void;
  onTogglePassword: () => void;
  onToggleConfirmPassword: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onVerify: (event: React.FormEvent) => void;
  onBack: () => void;
}

/**
 * Presentational auth gate untuk paper portfolio. Mutasi session tetap dimiliki page;
 * komponen ini hanya merender state/form agar login flow tidak bercampur dengan
 * money-path BUY/SELL di workspace portfolio.
 */
export function PortfolioAuthGate({
  mode,
  pendingVerification,
  email,
  password,
  confirmPassword,
  otpCode,
  showPassword,
  showConfirmPassword,
  error,
  loading,
  onModeChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onOtpCodeChange,
  onTogglePassword,
  onToggleConfirmPassword,
  onSubmit,
  onVerify,
  onBack,
}: PortfolioAuthGateProps) {
  return (
    <div className="min-h-screen bg-tv-bg flex items-center justify-center font-sans p-4">
      <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-8 shadow-1 max-w-sm w-full">
        <div className="flex justify-center mb-6">
          <div className="bg-tv-green/10 p-4 rounded-full text-tv-green">
            <Wallet className="w-8 h-8" />
          </div>
        </div>
        <h2 className="font-heading text-2xl font-bold text-center text-white mb-2">Akun Demo</h2>

        {pendingVerification ? (
          <>
            <p className="text-sm text-tv-muted text-center mb-6">
              Kode verifikasi sudah dikirim ke {email}. Masukkan kodenya untuk selesaikan pendaftaran.
            </p>
            <form onSubmit={onVerify} className="space-y-4">
              <Input
                label="Kode Verifikasi"
                type="text"
                value={otpCode}
                onChange={(event) => onOtpCodeChange(event.target.value)}
                placeholder="6 digit dari email"
              />
              {error && <p className="text-tv-red text-xs text-center font-medium">{error}</p>}
              <Button type="submit" variant="success" loading={loading} className="w-full mt-2">
                {loading ? 'Memverifikasi...' : 'Verifikasi & Masuk'}
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-tv-muted text-center mb-6">
              {mode === 'LOGIN' ? 'Masuk ke akun demo kamu.' : 'Daftar akun demo gratis.'}
            </p>

            <div className="flex bg-tv-bg p-1 rounded-lg mb-6 border border-tv-border">
              <Button
                variant="bare"
                size="none"
                onClick={() => onModeChange('LOGIN')}
                className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${mode === 'LOGIN' ? 'bg-tv-card shadow text-white' : 'text-tv-muted hover:text-tv-text'}`}
              >
                Login
              </Button>
              <Button
                variant="bare"
                size="none"
                onClick={() => onModeChange('SIGNUP')}
                className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${mode === 'SIGNUP' ? 'bg-tv-card shadow text-white' : 'text-tv-muted hover:text-tv-text'}`}
              >
                Daftar
              </Button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="Alamat email kamu"
              />
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="Password"
                rightIcon={<PasswordToggle shown={showPassword} onToggle={onTogglePassword} label="password" />}
              />
              {mode === 'SIGNUP' && (
                <Input
                  label="Konfirmasi Password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => onConfirmPasswordChange(event.target.value)}
                  placeholder="Ulangi password"
                  rightIcon={<PasswordToggle shown={showConfirmPassword} onToggle={onToggleConfirmPassword} label="konfirmasi password" />}
                />
              )}
              {error && <p className="text-tv-red text-xs text-center font-medium">{error}</p>}
              <Button type="submit" variant="success" loading={loading} className="w-full mt-2">
                {loading ? 'Loading...' : mode === 'LOGIN' ? 'Masuk' : 'Daftar'}
              </Button>
            </form>
          </>
        )}

        <div className="mt-6 text-center">
          <Button variant="bare" size="none" onClick={onBack} className="text-xs text-tv-muted hover:text-white font-medium">
            Kembali ke Beranda
          </Button>
        </div>
      </Card>
    </div>
  );
}
