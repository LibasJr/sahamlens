import fs from 'fs';
import path from 'path';

// === DEFAULT DATA: Fallback saat filesystem read-only (Vercel) ===
// Sengaja kosong - akun demo/portfolio virtual sekarang per-user (lihat data/users.json +
// app/api/auth/signup), jadi tidak ada lagi "portfolio bersama" bawaan untuk siapa pun yang
// belum signup. User baru wajib daftar dulu lewat /api/auth/signup.
const DEFAULT_PORTFOLIOS: any[] = [];

const DEFAULT_TRANSACTIONS: any[] = [];

// In-memory store untuk Vercel (karena filesystem read-only)
const memoryStore: Record<string, any> = {};

const isVercel = !!process.env.VERCEL;

export function readJson(filePath: string) {
  // 1. Coba dari memory dulu (untuk Vercel)
  if (memoryStore[filePath] !== undefined) {
    return memoryStore[filePath];
  }

  // 2. Coba baca dari filesystem
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      return data;
    }
  } catch (err) {
    console.warn(`[dbLocal] readJson failed for ${filePath}:`, err);
  }

  // 3. Fallback ke default data (JANGAN return null, biar gak blank)
  if (filePath.includes('portfolios.json')) {
    console.log('[dbLocal] Using default portfolios (Rp 100jt + DGWG -23.91%)');
    return DEFAULT_PORTFOLIOS;
  }
  if (filePath.includes('transactions.json')) {
    console.log('[dbLocal] Using default transactions (DGWG @369 + GGRM @17450)');
    return DEFAULT_TRANSACTIONS;
  }

  return null;
}

export function writeJson(filePath: string, data: any) {
  // Simpan ke memory selalu (untuk Vercel & local)
  memoryStore[filePath] = data;

  // Di Vercel, filesystem read-only — skip disk write, jangan crash
  if (isVercel) {
    console.log(`[dbLocal] Vercel mode: data saved to memory only (${filePath})`);
    return;
  }

  // Di local, tulis ke disk seperti biasa
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[dbLocal] Error writing json to', filePath, err);
  }
}
