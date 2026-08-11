'use client';

/**
 * 401 dari endpoint fitur tidak selalu boleh diterjemahkan menjadi "user belum
 * login". Pada praktiknya, beberapa endpoint dapat gagal membaca akses fitur
 * sementara session utama masih valid. UI harus cek /api/auth/me dulu agar user
 * yang sudah login tidak diminta login ulang saat pindah menu.
 */
export async function isAuthenticatedNow(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    return Boolean(res.ok && data?.authenticated && data?.user);
  } catch {
    return false;
  }
}

export async function shouldShowLoginPromptFor401(): Promise<boolean> {
  return !(await isAuthenticatedNow());
}
