// Barrel modules/broker-flow.
//
// Broker Summary aktif melalui pipeline resmi IDX `idx-flow-sync`.
// Endpoint TradingSummary/GetBrokerSummary menyediakan agregat EOD seluruh pasar
// per kode broker (value, volume, frequency), tanpa ticker dan tanpa sisi buy/sell.
// Karena itu data IDX disimpan terpisah di broker_market_daily dan tidak boleh
// dipaksakan masuk ke skema broker_summary_daily per-emiten.
//
// Integrasi Index Alpha per-emiten tetap dipertahankan hanya sebagai kode legacy;
// ia bukan lagi provider aktif maupun prasyarat Broker Summary produksi.
// Ownership Flow juga tetap merupakan besaran berbeda: komposisi kepemilikan,
// bukan transaksi per broker.

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

// EOD Broker Summary tingkat PASAR (agregat per kode broker, tanpa emiten dan tanpa
// pemisahan beli/jual) - sumber resmi BEI TradingSummary/GetBrokerSummary. Terpisah dari
// broker summary per-emiten di atas karena mengukur besaran yang berbeda; lihat
// database/migrations/009_broker_market_daily.sql.
export {
  getBrokerMarketDaily,
  normalizeBrokerMarketDate,
  BROKER_MARKET_SOURCE,
  type BrokerMarketDaily,
  type BrokerMarketDateSummary,
  type BrokerMarketRow,
} from './service/broker-market-daily.service';
