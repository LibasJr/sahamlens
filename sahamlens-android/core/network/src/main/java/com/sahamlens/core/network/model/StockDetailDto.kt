package com.sahamlens.core.network.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Bentuk asli GET /api/stock/[ticker] (butuh login + Pro) - satu panggilan yang sudah
 * membawa harga, 10 analyzer teknikal, konsensus, skor komposit, dan histori OHLCV chart. */
@Serializable
data class StockDetailResponse(
    val ticker: String,
    val price: Double = 0.0,
    val analyzers: List<AnalyzerDto> = emptyList(),
    val consensus: String = "HOLD",
    val scoring: ScoringDto? = null,
    val stock: StockHistoryDto? = null,
)

@Serializable
data class AnalyzerDto(
    val label: String,
    val value: String = "",
    val decision: String = "NETRAL",
    val confidence: Int = 0,
)

@Serializable
data class ScoringDto(
    @SerialName("total_score") val totalScore: Int = 0,
    @SerialName("technical_score") val technicalScore: Int = 0,
    @SerialName("fundamental_score") val fundamentalScore: Int = 0,
    @SerialName("flow_score") val flowScore: Int = 0,
    val kategori: String = "HOLD",
    @SerialName("alasan_3_poin") val alasan3Poin: List<String> = emptyList(),
    val risk: String? = null,
)

@Serializable
data class StockHistoryDto(
    val symbol: String = "",
    @SerialName("current_price") val currentPrice: Double = 0.0,
    @SerialName("change_pct") val changePct: Double = 0.0,
    val volume: Long = 0,
    val history: List<CandleDto> = emptyList(),
)

@Serializable
data class CandleDto(
    val time: String,
    val open: Double = 0.0,
    val high: Double = 0.0,
    val low: Double = 0.0,
    val close: Double = 0.0,
    val volume: Long = 0,
)

/** Bentuk asli GET /api/dcf/[ticker] (publik). Beberapa field opsional - bank/data FCF
 * tidak tersedia mengembalikan `not_applicable_reason` alih-alih tabel kosong diam-diam. */
@Serializable
data class DcfResponse(
    val quant: DcfQuantDto? = null,
    val analysis: DcfAnalysisDto? = null,
    @SerialName("not_applicable_reason") val notApplicableReason: String? = null,
)

@Serializable
data class DcfQuantDto(
    @SerialName("current_price") val currentPrice: Double = 0.0,
    @SerialName("wacc_pct") val waccPct: Double? = null,
    @SerialName("fair_value") val fairValue: Double? = null,
    @SerialName("valuation_status") val valuationStatus: String? = null,
    @SerialName("not_applicable") val notApplicable: Boolean = false,
)

@Serializable
data class DcfAnalysisDto(
    @SerialName("executive_summary") val executiveSummary: String = "",
)
