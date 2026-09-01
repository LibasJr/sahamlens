import { Stronghold } from '@tauri-apps/plugin-stronghold';
import { appDataDir, join } from '@tauri-apps/api/path';
import type { Ticker } from './main';

const vaultPasswordKey = 'sahamlens.vault-key.v3';

function getVaultPassword(): string {
  const saved = localStorage.getItem(vaultPasswordKey);
  if (saved) return saved;

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const generated = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(vaultPasswordKey, generated);
  } catch {
    throw new Error('Penyimpanan aman desktop tidak tersedia. Tutup aplikasi lalu buka kembali.');
  }
  return generated;
}

// Nama snapshot terikat ke password lokal. Jika WebView storage di-reset saat upgrade,
// password baru otomatis memakai snapshot baru dan tidak mencoba membuka vault lama dengan
// kunci yang salah. Password tidak ikut ditulis ke nama file; hanya fingerprint satu arah.
async function vaultPathFor(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const fingerprint = Array.from(new Uint8Array(digest).slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return join(await appDataDir(), `sahamlens-${fingerprint}.hold`);
}

async function getStore() {
  const password = getVaultPassword();
  const vault = await Stronghold.load(await vaultPathFor(password), password);
  let client;
  try { client = await vault.loadClient('sahamlens'); }
  catch { client = await vault.createClient('sahamlens'); }
  return { vault, store: client.getStore() };
}
async function put(key: string, value: string) { const { vault, store } = await getStore(); await store.insert(key, Array.from(new TextEncoder().encode(value))); await vault.save(); }
async function read(key: string) { const { store } = await getStore(); const value = await store.get(key); return value ? new TextDecoder().decode(new Uint8Array(value)) : null; }
export async function saveToken(token: string) { await put('jwt', token); }
export async function getToken() { return read('jwt'); }
export async function clearToken() { const { vault, store } = await getStore(); await store.remove('jwt'); await vault.save(); }
export async function saveWatchlist(stocks: Ticker[]) { await put('watchlist', JSON.stringify(stocks)); }
