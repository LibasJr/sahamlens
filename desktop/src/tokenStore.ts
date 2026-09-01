import { Stronghold } from '@tauri-apps/plugin-stronghold';
import type { Ticker } from './main';

const vaultPath = 'sahamlens.hold';
const vaultPasswordKey = 'sahamlens.vault-key.v1';

function getVaultPassword(): string {
  const saved = localStorage.getItem(vaultPasswordKey);
  if (saved) return saved;

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const generated = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(vaultPasswordKey, generated);
  return generated;
}

async function getStore() { const vault = await Stronghold.load(vaultPath, getVaultPassword()); let client; try { client = await vault.loadClient('sahamlens'); } catch { client = await vault.createClient('sahamlens'); } return { vault, store: client.getStore() }; }
async function put(key: string, value: string) { const { vault, store } = await getStore(); await store.insert(key, Array.from(new TextEncoder().encode(value))); await vault.save(); }
async function read(key: string) { const { store } = await getStore(); const value = await store.get(key); return value ? new TextDecoder().decode(new Uint8Array(value)) : null; }
export async function saveToken(token: string) { await put('jwt', token); }
export async function getToken() { return read('jwt'); }
export async function clearToken() { const { vault, store } = await getStore(); await store.remove('jwt'); await vault.save(); }
export async function saveWatchlist(stocks: Ticker[]) { await put('watchlist', JSON.stringify(stocks)); }
