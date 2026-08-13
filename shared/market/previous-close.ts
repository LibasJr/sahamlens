// Menentukan penutupan sesi sebelumnya untuk menghitung perubahan harga harian.
//
// BUG FIX (2026-08-13, laporan pengguna "IHSG plus padahal sedang minus"):
// `meta.previousClose` dari Yahoo TIDAK BISA dipercaya. Terukur pada ^JKSE hari itu:
//
//   riwayat harian Yahoo   : 11 Agu 6267,88 | 12 Agu 6373,85 | 13 Agu 6295,52
//   meta.previousClose     : 6267,88   <- penutupan 11 Agu, MELEWATI 12 Agu
//
// Akibatnya kartu IHSG menampilkan +0,42% padahal perubahan sesungguhnya -1,23%.
// Bukan salah baca, bukan data basi: angka acuannya sendiri yang keliru, dan arah
// yang ditampilkan jadi terbalik - kesalahan paling merusak kepercayaan yang bisa
// dilakukan aplikasi harga saham.
//
// Riwayat harian di respons yang sama internally consistent, jadi itu yang dipakai
// sebagai sumber utama. `meta` tetap dipertahankan sebagai cadangan untuk emiten yang
// riwayatnya terlalu pendek (mis. baru IPO) - lebih baik satu angka dengan cacat
// diketahui daripada tidak ada angka sama sekali.

export type PreviousCloseSource = 'daily-history' | 'meta' | 'none';

export interface PreviousCloseResult {
  previousClose: number | null;
  source: PreviousCloseSource;
  /** true bila meta.previousClose ADA tapi berbeda dari hasil riwayat harian. */
  metaDisagrees: boolean;
  /** Nilai meta yang ditolak - hanya untuk log diagnostik, tidak untuk ditampilkan. */
  metaValue: number | null;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Tanggal bursa dalam zona Jakarta - bukan zona server, yang bisa berbeda hari. */
function jakartaDate(epochSeconds: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epochSeconds * 1000));
}

/**
 * `timestamps` dan `closes` adalah larik bar HARIAN (interval 1d) dari Yahoo, urut
 * menaik. Bar terakhir adalah sesi berjalan; penutupan sebelumnya diambil dari bar
 * terakhir yang TANGGAL BURSA-nya berbeda - bukan sekadar elemen kedua dari belakang,
 * supaya bar ganda dalam satu hari (pernah terjadi pada respons Yahoo) tidak membuat
 * "penutupan kemarin" diambil dari jam sebelumnya di hari yang sama.
 */
export function resolvePreviousClose(input: {
  timestamps?: unknown;
  closes?: unknown;
  metaPreviousClose?: unknown;
  metaChartPreviousClose?: unknown;
}): PreviousCloseResult {
  const metaValue = isFinitePositive(input.metaPreviousClose)
    ? input.metaPreviousClose
    : isFinitePositive(input.metaChartPreviousClose)
      ? input.metaChartPreviousClose
      : null;

  const timestamps = Array.isArray(input.timestamps) ? input.timestamps : [];
  const closes = Array.isArray(input.closes) ? input.closes : [];

  // Bar dengan close null TETAP dicatat, hanya ditandai. Ini yang membedakan versi ini
  // dari versi pertama, dan sebabnya ada di baris berikutnya: tanggal sesi berjalan
  // ditentukan dari TIMESTAMP, bukan dari bar yang punya nilai. Yahoo menerbitkan bar
  // hari berjalan lebih dulu dan mengisi close-nya belakangan, jadi membuang bar null
  // sebelum menentukan "hari ini" membuat bar KEMARIN dikira hari ini - dan acuannya
  // mundur satu sesi terlalu jauh. Terukur 2026-08-14 pada ^JKSE: acuan terbaca 11 Agu
  // (6267,88) padahal seharusnya 12 Agu (6373,85), sehingga IHSG tampil +0,54%
  // padahal -1,13%. Arah yang terbalik, persis kesalahan yang file ini dibuat untuk
  // mencegah.
  const bars: { date: string; close: number | null }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const close = closes[i];
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
    bars.push({ date: jakartaDate(ts), close: isFinitePositive(close) ? close : null });
  }

  if (bars.length >= 2) {
    const latestDate = bars[bars.length - 1].date;
    for (let i = bars.length - 2; i >= 0; i--) {
      // Tanggal harus berbeda DAN nilainya harus ada - bar libur yang close-nya null
      // dilewati, sama seperti sebelumnya.
      const previousClose = bars[i].close;
      if (bars[i].date === latestDate || previousClose === null) continue;
      {
        // Toleransi longgar: Yahoo kadang membulatkan meta berbeda dari riwayat.
        // Yang dicari adalah selisih yang berarti (mis. beda sesi), bukan pembulatan.
        const metaDisagrees =
          metaValue != null && Math.abs(metaValue - previousClose) > Math.max(0.01, previousClose * 0.0005);
        return { previousClose, source: 'daily-history', metaDisagrees, metaValue };
      }
    }
  }

  return {
    previousClose: metaValue,
    source: metaValue != null ? 'meta' : 'none',
    metaDisagrees: false,
    metaValue,
  };
}
