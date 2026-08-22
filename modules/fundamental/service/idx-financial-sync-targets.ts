/**
 * Periode laporan mana yang perlu disinkronkan dari BEI pada suatu tanggal.
 *
 * Laporan keuangan tidak datang sekaligus - ia menetes selama berbulan-bulan setelah
 * periodenya berakhir. Karena itu tiap kali sync berjalan, yang ditarik adalah periode
 * yang SEDANG dalam jendela pelaporannya, bukan satu periode "terbaru" saja.
 *
 * Dua periode per jalan, bukan satu: emiten yang telat lapor untuk periode sebelumnya
 * masih terus masuk saat periode berikutnya sudah dibuka. Menyinkronkan satu periode
 * saja berarti pelapor telat itu tidak pernah terjemput.
 *
 * KALENDER INI DIVERIFIKASI DENGAN DATA NYATA, bukan disimpulkan dari peraturan.
 * Dicek langsung ke endpoint BEI pada 22 Agustus 2026 (bulan 8):
 *
 *   2026 TW2   787 emiten sudah melapor   <- jendela sedang terbuka
 *   2026 TW1   848 emiten sudah melapor   <- masih menerima pelapor telat
 *   2026 TW3     0 emiten                 <- belum jatuh tempo, benar tidak ditarget
 *   2025 AUDIT 882 emiten sudah melapor
 *
 * Sengaja TIDAK ada penebakan tanggal jatuh tempo per emiten. Skrip sync-nya idempoten
 * (File_Modified tidak berubah -> lewati), jadi menarget periode yang ternyata masih
 * kosong tidak merugikan apa pun selain satu permintaan daftar.
 */

export type IdxFinancialPeriod = 'tw1' | 'tw2' | 'tw3' | 'audit';

export interface IdxFinancialSyncTarget {
  year: number;
  period: IdxFinancialPeriod;
  /** Kenapa periode ini ditarget - ikut ke keluaran job supaya bisa dibaca di log. */
  reason: string;
}

/** Tahun & bulan menurut WIB, bukan menurut zona server. Pola sama dengan
 * shared/market/trading-session.ts: jadwal bursa selalu dinilai di Asia/Jakarta. */
function yearMonthWIB(now: Date): { year: number; month: number } {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const [year, month] = formatted.split('-').map(Number);
  return { year, month };
}

export function resolveIdxFinancialSyncTargets(now: Date): IdxFinancialSyncTarget[] {
  const { year, month } = yearMonthWIB(now);

  if (month <= 3) {
    return [
      { year: year - 1, period: 'audit', reason: `Laporan tahunan auditan ${year - 1} jatuh tempo akhir Maret ${year}.` },
      { year: year - 1, period: 'tw3', reason: `TW3 ${year - 1} masih menerima pelapor telat.` },
    ];
  }
  if (month <= 6) {
    return [
      { year, period: 'tw1', reason: `TW1 ${year} dalam jendela pelaporannya.` },
      { year: year - 1, period: 'audit', reason: `Laporan tahunan auditan ${year - 1} masih menerima pelapor telat.` },
    ];
  }
  if (month <= 9) {
    return [
      { year, period: 'tw2', reason: `TW2 ${year} dalam jendela pelaporannya.` },
      { year, period: 'tw1', reason: `TW1 ${year} masih menerima pelapor telat.` },
    ];
  }
  return [
    { year, period: 'tw3', reason: `TW3 ${year} dalam jendela pelaporannya.` },
    { year, period: 'tw2', reason: `TW2 ${year} masih menerima pelapor telat.` },
  ];
}
