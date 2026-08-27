'use client';

import { Metric, NA, Scroller, Td, Th, ValidationCard, int, wib } from './shared-ui';
import type { Dashboard } from './types';

/** "Data Quality": kelengkapan bar OHLC dan ticker/hari bermasalah. */
export function DataQualitySection({ dataQuality }: { dataQuality: Dashboard['dataQuality'] }) {
  return (
    <ValidationCard title="Data Quality" subtitle="Validasi tidak dijalankan kalau kelengkapan bar di bawah batas minimum.">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Metric label="Candle valid" value={dataQuality.completenessPct == null ? NA : `${dataQuality.completenessPct}%`} />
        <Metric label="Bar mentah diharapkan" value={int(dataQuality.totalExpectedBars)} />
        <Metric label="Bar valid" value={int(dataQuality.totalValidBars)} />
        <Metric label="Missing bars" value={int(dataQuality.totalMissingBars)} />
        <Metric label="Duplicate bars" value={int(dataQuality.totalDuplicateBars)} />
        <Metric label="Invalid OHLC" value={int(dataQuality.totalInvalidOhlcBars)} />
        <Metric
          label="Hari hilang total"
          value={int(dataQuality.missingDayRows)}
          hint="Hari bursa berjalan (IHSG punya bar) tetapi emiten ini nihil bar."
        />
        <Metric label="Ticker terpantau" value={int(dataQuality.tickersTracked)} />
        <Metric label="Hari terpantau" value={int(dataQuality.daysTracked)} />
        <Metric label="Provider terakhir berhasil" value={wib(dataQuality.lastRetrievedAt)} />
        <Metric
          label="Error fetch terakhir"
          value={dataQuality.lastFetchError ? `${dataQuality.lastFetchError.ticker}: ${dataQuality.lastFetchError.error}` : <span className="text-tv-muted">tidak ada</span>}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-semibold text-tv-muted uppercase mb-2">Ticker bermasalah</h3>
          {dataQuality.problemTickers.length === 0 ? (
            <p className="text-xs text-tv-muted">Tidak ada.</p>
          ) : (
            <Scroller>
              <table className="w-full text-xs">
                <thead className="text-tv-muted">
                  <tr>
                    <Th>Ticker</Th>
                    <Th>Hari bermasalah</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {dataQuality.problemTickers.map((row) => (
                    <tr key={row.ticker}>
                      <Td>{row.ticker}</Td>
                      <Td>{int(row.badDays)}</Td>
                      <Td>{row.worstStatus}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>
          )}
        </div>
        <div>
          <h3 className="text-xs font-semibold text-tv-muted uppercase mb-2">Hari bursa bermasalah</h3>
          {dataQuality.problemDates.length === 0 ? (
            <p className="text-xs text-tv-muted">Tidak ada.</p>
          ) : (
            <Scroller>
              <table className="w-full text-xs">
                <thead className="text-tv-muted">
                  <tr>
                    <Th>Tanggal</Th>
                    <Th>Ticker bermasalah</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-tv-border">
                  {dataQuality.problemDates.map((row) => (
                    <tr key={row.tradingDate}>
                      <Td>{row.tradingDate}</Td>
                      <Td>{int(row.badTickers)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Scroller>
          )}
        </div>
      </div>
    </ValidationCard>
  );
}
