import type {
  SourceAuditStatus,
  SourceCadence,
  SourceFormat,
} from '../types/ownership-flow.types';
import { getOwnershipFlowConfig } from '../config/ownership-flow.config';

// REGISTRY SUMBER DATA KEPEMILIKAN.
//
// Setiap sumber WAJIB mendeklarasikan status auditnya. Selama `auditStatus`
// masih 'UNVERIFIED', ingestion produksi menolak berjalan - tidak peduli
// feature flag apa pun yang dinyalakan operator.
//
// KENAPA BEGINI, dan kenapa status ini tidak boleh dinaikkan begitu saja:
// struktur HTML sumber TIDAK dapat diverifikasi dari sandbox pengembangan
// (jaringan keluar diblokir kebijakan environment). Menulis parser berdasarkan
// ingatan tentang tata letak halaman, lalu menandainya "verified", persis sama
// dengan mengarang - hanya saja kesalahannya baru ketahuan setelah ratusan
// baris palsu masuk tabel histori yang seharusnya append-only.
//
// PROSEDUR MENAIKKAN STATUS KE 'VERIFIED':
//   1. Operator menjalankan `npm run audit:ksei-ownership` di VPS (outbound
//      internet normal). Lihat scripts/audit-ksei-ownership-source.mjs.
//   2. Script menghasilkan reports/ksei-ownership-source-audit.json + fixture
//      HTML tersanitasi di data/source-fixtures/ksei/.
//   3. Parser diimplementasikan/dikoreksi TERHADAP FIXTURE NYATA itu, dengan
//      test yang membaca fixture tersebut.
//   4. Barulah `auditStatus` di bawah diubah, dalam commit yang sama dengan
//      fixture dan test-nya - supaya alasan perubahan status ikut terekam.
//
// Lihat docs/ownership-flow/source-audit.md untuk checklist lengkap §3.

/** Peran sebuah sumber. Membedakan ini mencegah kesalahan kelas berat (§ arsip). */
export type SourceUsage =
  /** Snapshot posisi terkini per ticker - dasar Ownership Flow harian. */
  | 'PRIMARY_SNAPSHOT'
  /**
   * Arsip periodik (bulanan). Boleh dipakai sebagai seed historis dan cross-
   * check, TIDAK BOLEH diperlakukan sebagai observasi harian. Tanggal snapshot
   * aslinya (mis. 30 Jun 2026) wajib dipertahankan apa adanya.
   */
  | 'HISTORICAL_SEED';

export interface OwnershipSourceDescriptor {
  id: string;
  name: string;
  /** Basis URL resmi. Tidak ada kredensial, tidak ada cookie, tidak ada token. */
  baseUrl: string;
  usage: SourceUsage;
  format: SourceFormat;
  /**
   * Cadence publikasi. 'UNKNOWN' selama audit belum membuktikannya - dan itu
   * membuat seluruh data dinilai STALE (fail-closed di assessFreshness).
   */
  cadence: SourceCadence;
  auditStatus: SourceAuditStatus;
  /** Catatan audit yang wajib dibaca sebelum menyentuh status di atas. */
  auditNote: string;
  /** Field yang DIHARAPKAN tersedia menurut dokumentasi/halaman publik. */
  expectedFields: readonly string[];
}

/**
 * Halaman registered securities KSEI per emiten.
 *
 * Field yang ditampilkan halaman publik menurut informasi yang diberikan pemilik
 * produk: Security Name, Issuer, ISIN Code, Short Code, Number of Securities,
 * As of, Scripless Percentage, Local Percentage, Foreign Percentage.
 *
 * Itu adalah HARAPAN, bukan hasil verifikasi - karena itu auditStatus di bawah
 * tetap UNVERIFIED sampai fixture nyata dari VPS tersedia.
 */
export const KSEI_REGISTERED_SECURITY: OwnershipSourceDescriptor = {
  id: 'KSEI_REGISTERED_SECURITY',
  name: 'KSEI - Registered Securities (Shares)',
  baseUrl: 'https://web.ksei.co.id/services/registered-securities/shares/lc',
  usage: 'PRIMARY_SNAPSHOT',
  format: 'HTML',
  // Belum terbukti harian. Halaman menampilkan "As of", tetapi seberapa sering
  // tanggal itu bergerak HANYA bisa dijawab dengan mengamati beberapa hari
  // berturut-turut di VPS. Sampai itu terjadi: UNKNOWN, dan freshness
  // fail-closed ke STALE.
  cadence: 'UNKNOWN',
  auditStatus: 'UNVERIFIED',
  auditNote:
    'Struktur HTML belum diverifikasi penuh. Audit VPS 2026-08-16 menemukan struktur halaman terbaca, ' +
    'TETAPI sebagian emiten (mis. TLKM) mengembalikan halaman ASLI dengan isi PLACEHOLDER: ' +
    'Scripless/Local/Foreign semuanya 0,00% dan tanggal "As of" tidak terparse. ' +
    'Karena itu "struktur terbukti" TIDAK cukup untuk menaikkan status ini - parser harus lolos test ' +
    'terhadap fixture nyata (termasuk kasus placeholder yang WAJIB ditolak) lebih dulu. ' +
    'Setiap ticker tetap divalidasi independen saat ingestion. ' +
    'Jalankan npm run audit:ksei-ownership di VPS, lampirkan fixture, baru naikkan status ini.',
  expectedFields: [
    'Security Name',
    'Issuer',
    'ISIN Code',
    'Short Code',
    'Number of Securities',
    'As of',
    'Scripless Percentage',
    'Local Percentage',
    'Foreign Percentage',
  ],
};

/**
 * Arsip Holding Composition (Local-Foreign) KSEI.
 *
 * PERINGATAN YANG TIDAK BOLEH DIABAIKAN: ini snapshot PERIODIK/BULANAN. Baris
 * bertanggal "30 Jun 2026" adalah posisi akhir Juni, dan harus tersimpan dengan
 * observed_date 2026-06-30 apa adanya. Memperlakukannya sebagai observasi harian
 * - atau menimpanya dengan tanggal cron - akan menghasilkan delta 1D/7D yang
 * sepenuhnya fiktif.
 */
export const KSEI_HOLDING_COMPOSITION_ARCHIVE: OwnershipSourceDescriptor = {
  id: 'KSEI_HOLDING_COMPOSITION',
  name: 'KSEI - Holding Composition Archive (Local/Foreign)',
  baseUrl: 'https://web.ksei.co.id/archive_download/holding_composition',
  usage: 'HISTORICAL_SEED',
  format: 'TXT',
  cadence: 'MONTHLY',
  auditStatus: 'VERIFIED',
  auditNote:
    'Format arsip resmi telah diverifikasi pada BalanceposEfek20260731.zip (snapshot 31 Jul 2026): ' +
    'ZIP berisi BalanceposYYYYMMDD.txt, delimiter pipe (|), tanggal DD-MMM-YYYY. Format nyata memakai ' +
    'dua header bernama Total: Total pertama setelah blok Local = total lokal, Total kedua setelah blok Foreign = total asing; ' +
    'Sec. Num adalah jumlah efek total dan menjadi denominator persentase scripless. Sumber ini TETAP hanya untuk seed/cross-check bulanan; ' +
    'status VERIFIED di sini TIDAK membuka ingestion snapshot harian KSEI_REGISTERED_SECURITY.',
  expectedFields: [
    'Date',
    'Code',
    'Type',
    'Sec. Num',
    'Price',
    'Total (setelah Local OT)',
    'Total (setelah Foreign OT)',
  ],
};

export const OWNERSHIP_SOURCES: readonly OwnershipSourceDescriptor[] = [
  KSEI_REGISTERED_SECURITY,
  KSEI_HOLDING_COMPOSITION_ARCHIVE,
];

export function getSourceById(id: string): OwnershipSourceDescriptor | null {
  return OWNERSHIP_SOURCES.find((source) => source.id === id) ?? null;
}

/** Sumber yang dipakai ingestion snapshot harian. */
export function getPrimarySource(): OwnershipSourceDescriptor {
  return KSEI_REGISTERED_SECURITY;
}

export type IngestionGateReason =
  | 'OK'
  | 'MODULE_DISABLED'
  | 'INGESTION_DISABLED'
  | 'SOURCE_UNVERIFIED'
  | 'SOURCE_PROHIBITED';

export interface IngestionGate {
  allowed: boolean;
  reason: IngestionGateReason;
  message: string;
}

/**
 * Gerbang tunggal yang memutuskan boleh-tidaknya MENULIS data ke database.
 *
 * Dipanggil cron sebelum melakukan apa pun. Semua syarat harus terpenuhi
 * bersamaan; tidak ada jalan pintas lewat env var tunggal. Khususnya:
 * `auditStatus !== 'VERIFIED'` memblokir ingestion walaupun
 * OWNERSHIP_FLOW_INGESTION_ENABLED=true, karena flag itu menyatakan niat
 * operator, sedangkan status audit menyatakan FAKTA tentang sumbernya.
 */
export function canIngest(
  source = getPrimarySource(),
  config = getOwnershipFlowConfig()
): IngestionGate {
  if (!config.enabled) {
    return {
      allowed: false,
      reason: 'MODULE_DISABLED',
      message: 'OWNERSHIP_FLOW_ENABLED belum aktif.',
    };
  }
  if (source.auditStatus === 'PROHIBITED') {
    return {
      allowed: false,
      reason: 'SOURCE_PROHIBITED',
      message: `Sumber ${source.id} ditandai PROHIBITED: ${source.auditNote}`,
    };
  }
  if (source.auditStatus !== 'VERIFIED') {
    return {
      allowed: false,
      reason: 'SOURCE_UNVERIFIED',
      message:
        `Sumber ${source.id} belum terverifikasi. Ingestion produksi ditolak (fail-closed). ${source.auditNote}`,
    };
  }
  if (!config.ingestionEnabled) {
    return {
      allowed: false,
      reason: 'INGESTION_DISABLED',
      message: 'OWNERSHIP_FLOW_INGESTION_ENABLED belum aktif.',
    };
  }
  return { allowed: true, reason: 'OK', message: 'Ingestion diizinkan.' };
}
