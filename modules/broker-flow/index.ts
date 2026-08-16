// Barrel modules/broker-flow.
//
// ============================================================================
// FITUR NONAKTIF - SENGAJA DIPERTAHANKAN, JANGAN DIHAPUS.
//
// Disabled because ingestion currently requires manual source upload.
// Retained for future automated/legal data source.
//
// Dinonaktifkan 2026-08-14: ingestion menuntut upload berkas sumber MANUAL per
// emiten, yang tidak scalable untuk ratusan ticker. Timer systemd
// broker-summary-scan di-disable (bukan dihapus) - lihat catatan entrinya di
// config/scheduled-jobs.json.
//
// YANG TETAP UTUH DAN TIDAK BOLEH DIHAPUS: seluruh kode di modul ini, skema
// database broker summary, dan SELURUH DATA HISTORISNYA. Tidak ada migrasi
// destruktif yang boleh dibuat untuknya.
//
// Fitur ini menunggu sumber broker summary yang legal, stabil, dan dapat
// diotomasi. Begitu tersedia, ia dapat diaktifkan kembali tanpa kehilangan
// apa pun.
//
// CATATAN PENTING: modules/ownership-flow BUKAN pengganti modul ini. Keduanya
// mengukur besaran yang BERBEDA - transaksi per kode broker (di sini) vs
// komposisi kepemilikan (di sana) - dan yang satu tidak dapat disimpulkan dari
// yang lain. Lihat docs/ownership-flow/broker-vs-ownership.md dan
// docs/ownership-flow/broker-summary-status.md.
// ============================================================================

export {
  importBrokerSummaryCsv,
  importBrokerDistributionJson,
  BrokerSummaryValidationError,
  MAX_BROKER_CSV_BYTES,
  type BrokerSummaryImportInput,
  type BrokerDistributionJsonInput,
  type BrokerSummaryImportResult,
  type BrokerPeriodPreviewRow,
} from './service/broker-summary-import.service';

export {
  getLatestBrokerPeriodSummary,
  type BrokerPeriodView,
  type BrokerPeriodViewRow,
} from './service/broker-period-query.service';

export {
  indexAlphaBatchToCsv,
  syncIndexAlphaBrokerSummary,
  type IndexAlphaSyncResult,
} from './service/index-alpha-broker-summary.service';

export {
  getBrokerSummaryMonitor,
  normalizeBrokerMonitorTicker,
  type BrokerSummaryMonitor,
  type BrokerMonitorDateSummary,
  type BrokerMonitorRow,
} from './service/broker-summary-monitor.service';
