import { Stronghold } from '@tauri-apps/plugin-stronghold';
import type { Ticker } from './main';

const vaultPath = 'sahamlens.hold';
const vaultPassword = 'sahamlens-desktop-local-vault';
const storeName = 'session';
async function getStore() { const vault = await Stronghold.load(vaultPath, vaultPassword); let client; try { client = await vault.loadClient('sahamlens'); } catch { client = await vault.createClient('sahamlens'); } return { vault, store: client.getStore() }; }
async function put(key: string, value: string) { const { vault, store } = await getStore(); await store.insert(key, Array.from(new TextEncoder().encode(value))); await vault.save(); }
async function read(key: string) { const { store } = await getStore(); const value = await store.get(key); return value ? new TextDecoder().decode(new Uint8Array(value)) : null; }
export async function saveToken(token: string) { await put('jwt', token); }
export async function getToken() { return read('jwt'); }
export async function saveWatchlist(stocks: Ticker[]) { await put('watchlist', JSON.stringify(stocks)); }
