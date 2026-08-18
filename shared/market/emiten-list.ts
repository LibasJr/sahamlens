import fs from 'fs';
import path from 'path';

export type Emiten = { symbol: string; name: string; board: string };

let cached: Emiten[] | null = null;
let cachedSymbolSet: Set<string> | null = null;
let cachedBoardBySymbol: Map<string, string> | null = null;

const PLACEHOLDER_NAME = /\s+Company Tbk\.?$/;

// Kode yang belum punya nama resmi kadang terisi placeholder "XXXX Company Tbk." - jangan
// pernah tampilkan placeholder itu sebagai nama perusahaan (fabrikasi), tampilkan kodenya.
function normalizeName(symbol: string, rawName: string): string {
  return PLACEHOLDER_NAME.test(rawName) ? symbol : rawName;
}

// Dipindah dari app/api/emiten/route.ts (2026-08-05) supaya bisa dipakai ulang server-side
// oleh app/api/chat/route.ts (deteksi kode saham dari teks pertanyaan bebas) tanpa
// melakukan HTTP fetch ke API-nya sendiri. Cache di module scope sama seperti sebelumnya -
// bertahan lintas request selama instance serverless yang sama masih hangat.
export function loadEmitenList(): Emiten[] {
  if (cached) return cached;
  const allCsvPath = path.join(process.cwd(), 'all.csv');
  const legacyCsvPath = path.join(process.cwd(), 'idx_emiten_900.csv');
  const csvPath = fs.existsSync(allCsvPath) ? allCsvPath : legacyCsvPath;
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
  const header = lines[0] || '';
  const isAllCsv = header.toLowerCase().startsWith('code,');

  cached = lines.slice(1).map((line) => {
    const parts = line.split(',');
    const symbol = (isAllCsv ? parts[0] : parts[1] || '').trim();
    const rawName = (isAllCsv ? parts[1] : parts[2] || '').trim();
    const board = (isAllCsv ? parts[4] : parts[4] || '').trim();
    return {
      symbol,
      name: normalizeName(symbol, rawName),
      board,
    };
  }).filter((r) => r.symbol && r.name);

  return cached;
}

/** Set kode saham asli (tanpa ".JK") untuk validasi cepat - dipakai memvalidasi kandidat
 * ticker yang diekstrak dari teks bebas, supaya kata 4-huruf kapital acak (mis. "GILA")
 * tidak diperlakukan seolah kode saham sungguhan. */
export function getEmitenSymbolSet(): Set<string> {
  if (cachedSymbolSet) return cachedSymbolSet;
  cachedSymbolSet = new Set(loadEmitenList().map((e) => e.symbol));
  return cachedSymbolSet;
}

/**
 * Papan pencatatan IDX untuk satu emiten, apa adanya dari kolom `listing_board` di
 * `all.csv` ("Utama" | "Pengembangan" | "Pemantauan Khusus" | "Akselerasi" |
 * "Ekonomi Baru").
 *
 * BUG FIX (audit kuantitatif 2026-08-19, temuan C-01): kolom ini sudah dibaca
 * `loadEmitenList()` sejak lama lalu dibuang, sementara `lib/utils/idx-trading-board.ts`
 * mengklasifikasikan papan dari TIGA HIMPUNAN TICKER YANG DITULIS TANGAN. Diukur
 * terhadap CSV yang sama: 419 dari 962 emiten (43,6%) salah papan - 224 emiten Papan
 * Utama dilabeli "Papan Pengembangan", dan 4 emiten Papan Utama (BUMI, DEWA, ENRG,
 * BRMS) diberi peringatan "Periodic Call Auction 5 sesi lelang/hari" yang tidak berlaku
 * untuk mereka.
 *
 * `null` = kode tidak ada di master emiten (mis. indeks `^JKSE`, atau emiten yang sudah
 * delisting seperti MYRX). Pemanggil WAJIB memperlakukannya sebagai "papan tidak
 * diketahui" dan tidak menampilkan lencana apa pun - bukan menebak papan default.
 */
export function getEmitenBoard(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const clean = symbol.replace(/\.JK$/i, '').toUpperCase().trim();
  if (!clean) return null;
  if (!cachedBoardBySymbol) {
    cachedBoardBySymbol = new Map(
      loadEmitenList()
        .filter((e) => e.board)
        .map((e) => [e.symbol.toUpperCase(), e.board]),
    );
  }
  return cachedBoardBySymbol.get(clean) ?? null;
}
