import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { encrypt, decrypt } from './jwt';
import { ANON_TRIAL_COOKIE } from '../constants/cookie-names';

// Trial 7 hari untuk pengunjung TANPA akun - dipakai 7 endpoint "lihat-analisa" yang
// sebelumnya wajib login (Market Pulse, Calendar, Multi-agent, Council AI, Backtest,
// Breakout Radar, Recommendations). TIDAK dipakai endpoint yang menyimpan data pribadi
// (Watchlist/Alert tetap wajib akun - lihat docs/superpowers/specs/2026-08-02-
// anonymous-trial-design.md).
//
// Mekanisme: cookie HttpOnly ditandatangani (bukan bisa diedit klien) berisi kapan
// pertama kali dilihat. Reset via hapus cookie/incognito/browser lain diterima sebagai
// risiko yang wajar (keputusan produk 2026-08-02) - fokusnya UX jujur, bukan anti-abuse
// ketat. Kalau visitor akhirnya daftar akun, trial akun mulai FRESH TRIAL_DAYS lagi -
// TIDAK terhubung dengan sisa hari trial anonim ini (keputusan produk yang sama).
const ANON_TRIAL_DAYS = 7; // jendela bisnis "aktif" - TIDAK BOLEH sama dengan umur token/cookie di bawah,
                            // atau cookie akan terhapus/token invalid PAS SAAT harusnya baru jadi "expired",
                            // membuat readOrIssueAnonymousTrial salah membaca ini sebagai "belum pernah lihat"
                            // dan menerbitkan trial baru tanpa batas (bug kritis yang baru diperbaiki).
const ANON_TRIAL_WINDOW_SEC = ANON_TRIAL_DAYS * 24 * 60 * 60;
const ANON_TOKEN_TTL_DAYS = 180; // umur token JWT & cookie - jauh lebih panjang dari jendela aktif di atas,
                                  // supaya visitor lama yang cookie-nya MASIH ADA tapi sudah lewat 7 hari
                                  // tetap bisa DIBACA (decrypt sukses) dan benar dihitung active:false,
                                  // bukan gagal decrypt lalu disangka "baru".
const ANON_TOKEN_MAX_AGE_SEC = ANON_TOKEN_TTL_DAYS * 24 * 60 * 60;

interface AnonTrialPayload {
  typ: 'anon_trial'; // diskriminator - membedakan payload trial anonim dari payload sesi login
                      // asli, keduanya ditandatangani encrypt/decrypt yang sama (lihat jwt.ts).
                      // Tanpa ini, token trial anonim yang ditempel manual sebagai cookie
                      // "session" akan lolos getSession() sebagai sesi valid (id/email undefined).
  firstSeenAt: string; // ISO timestamp
}

export interface AnonTrialState {
  firstSeenAt: string;
  expiresAt: string;
  active: boolean;
  isNew: boolean; // true kalau baru dibuat request ini - caller WAJIB tempelkan cookie ke response
}

function computeState(firstSeenAt: string, isNew: boolean): AnonTrialState {
  const expiresAt = new Date(new Date(firstSeenAt).getTime() + ANON_TRIAL_WINDOW_SEC * 1000).toISOString();
  return { firstSeenAt, expiresAt, active: new Date(expiresAt).getTime() > Date.now(), isNew };
}

// Baca cookie trial yang ada, atau buat state baru (belum ditulis ke cookie - lihat
// applyAnonymousTrialCookie) kalau belum ada/rusak. Panggil HANYA saat !session (kalau
// user sudah login, trial akun/checkProAccess yang berlaku, bukan ini).
export async function readOrIssueAnonymousTrial(): Promise<AnonTrialState> {
  const existing = cookies().get(ANON_TRIAL_COOKIE)?.value;
  if (existing) {
    const payload = await decrypt<AnonTrialPayload>(existing);
    if (payload?.typ === 'anon_trial' && payload.firstSeenAt) {
      return computeState(payload.firstSeenAt, false);
    }
  }
  // Tidak ada cookie, atau rusak/gagal decrypt - diperlakukan sebagai "belum pernah
  // lihat", BUKAN sebagai trial kadaluarsa. Trial baru mulai dari sekarang.
  return computeState(new Date().toISOString(), true);
}

// Tempelkan cookie ke response HANYA kalau trial.isNew (request-request berikutnya
// yang membaca cookie yang sudah ada TIDAK menulis ulang setiap kali).
export async function applyAnonymousTrialCookie(res: NextResponse, trial: AnonTrialState): Promise<void> {
  if (!trial.isNew) return;
  const token = await encrypt<AnonTrialPayload>({ typ: 'anon_trial', firstSeenAt: trial.firstSeenAt }, `${ANON_TOKEN_TTL_DAYS}d`);
  res.cookies.set(ANON_TRIAL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ANON_TOKEN_MAX_AGE_SEC,
    path: '/',
  });
}
