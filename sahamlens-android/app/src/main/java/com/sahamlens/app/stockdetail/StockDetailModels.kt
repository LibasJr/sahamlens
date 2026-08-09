package com.sahamlens.app.stockdetail

import com.sahamlens.core.designsystem.component.Candle

/** State Detail Saham - diisi dari GET /api/stock/[ticker] (analyzers, scoring, chart) +
 * GET /api/dcf/[ticker], lewat [StockDetailViewModel]. Bukan lagi data contoh tetap. */
data class StockDetailUiState(
    val ticker: String = "",
    val isLoading: Boolean = true,
    /** 401 = belum login, 402 = fitur Pro, lainnya = kegagalan jaringan biasa. */
    val errorCode: Int? = null,
    val price: Double = 0.0,
    val changePct: Double = 0.0,
    val consensus: String = "HOLD",
    val totalScore: Int = 0,
    val aiSummary: String = "",
    val candles: List<Candle> = emptyList(),
    val technicalRows: List<AnalyzerRow> = emptyList(),
    val fundamentalRows: List<AnalyzerRow> = emptyList(),
    val fundamentalConsensus: String? = null,
    val bandarNote: String? = null,
    val dcf: DcfUiState? = null,
    val tradeMessage: String? = null,
)

data class AnalyzerRow(val label: String, val value: String, val decision: String)

data class DcfUiState(
    val fairValue: Double? = null,
    val valuationStatus: String? = null,
    val notApplicableReason: String? = null,
    val executiveSummary: String = "",
)
