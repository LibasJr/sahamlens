package com.sahamlens.core.network.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Bentuk asli GET /api/live/[ticker] (publik, dipakai untuk kutipan indeks mis. ^JKSE). */
@Serializable
data class LiveQuoteDto(
    val price: Double = 0.0,
    val changePercent: Double = 0.0,
    val volume: Long = 0,
)

/** Baris ringan yang dipakai berulang di GET /api/market-summary (publik). */
@Serializable
data class MarketStockRowDto(
    val symbol: String,
    val price: Double = 0.0,
    val changePct: Double = 0.0,
    val volume: Long = 0,
    val value: Double = 0.0,
    val score: Int = 0,
    val rsi: Double = 0.0,
)

/** Bentuk asli GET /api/market-summary (publik, 250 saham likuid, lihat market-summary.service.ts). */
@Serializable
data class MarketSummaryResponse(
    val timestamp: String = "",
    val topGainers: List<MarketStockRowDto> = emptyList(),
    val topLosers: List<MarketStockRowDto> = emptyList(),
    val topVolume: List<MarketStockRowDto> = emptyList(),
    val topValue: List<MarketStockRowDto> = emptyList(),
    val topTechnical: List<MarketStockRowDto> = emptyList(),
    val topTechnicalBearish: List<MarketStockRowDto> = emptyList(),
    val topRsiOversold: List<MarketStockRowDto> = emptyList(),
)

/** Kategori "Hari Ini AI Menemukan" - bentuk asli GET /api/daily-picks (publik). */
@Serializable
data class DailyPickCategoryDto(
    val count: Int = 0,
    val items: List<String> = emptyList(),
)

@Serializable
data class DailyPicksResponse(
    val attractive: DailyPickCategoryDto = DailyPickCategoryDto(),
    val risky: DailyPickCategoryDto = DailyPickCategoryDto(),
    val undervalue: DailyPickCategoryDto = DailyPickCategoryDto(),
    val breakout: DailyPickCategoryDto = DailyPickCategoryDto(),
    val goldenCross: DailyPickCategoryDto = DailyPickCategoryDto(),
    val deadCross: DailyPickCategoryDto = DailyPickCategoryDto(),
    val weeklyMomentum: DailyPickCategoryDto = DailyPickCategoryDto(),
)

/** Satu baris GET /api/recommendations (butuh login + Pro). */
@Serializable
data class RecommendationDto(
    val ticker: String,
    val sector: String? = null,
    val price: Double = 0.0,
    val changePct: Double = 0.0,
    val consensus: String = "HOLD",
    val confidence: Int = 0,
    val sentimentScore: Int = 0,
    val sentimentLabel: String = "Netral",
    val foreignFlow: String? = null,
    val bullishVotes: Int = 0,
    val bearishVotes: Int = 0,
)

@Serializable
data class RecommendationsResponse(
    val recommendations: List<RecommendationDto> = emptyList(),
)

// --- Market Pulse (GET /api/market-pulse, butuh login + Pro) ---

@Serializable
data class MarketPulseIndexDto(
    val symbol: String = "",
    val name: String = "",
    val fullName: String = "",
    val price: Double = 0.0,
    val changePct: Double = 0.0,
)

@Serializable
data class SectorHeatmapStockDto(
    val symbol: String = "",
    val changePct: Double = 0.0,
)

@Serializable
data class SectorHeatmapDto(
    val sector: String = "",
    val changePct: Double = 0.0,
    val stocks: List<SectorHeatmapStockDto> = emptyList(),
)

/** Satu DTO dipakai ulang untuk topGainers/topLosers/topVolume/topValue - tiap daftar cuma
 * mengisi sebagian field (sama seperti pola [MarketStockRowDto] di atas), field yang tidak
 * relevan diam-diam default ke 0/kosong lewat kotlinx.serialization, bukan dikarang. */
@Serializable
data class BreadthMoverDto(
    val symbol: String = "",
    val changePct: Double = 0.0,
    val price: Double = 0.0,
    val volume: Long = 0,
    val value: Double = 0.0,
)

@Serializable
data class MarketBreadthDto(
    val total: Int = 0,
    val advancing: Int = 0,
    val declining: Int = 0,
    val unchanged: Int = 0,
    val advanceDeclineRatio: Double = 0.0,
    val topGainers: List<BreadthMoverDto> = emptyList(),
    val topLosers: List<BreadthMoverDto> = emptyList(),
    val topVolume: List<BreadthMoverDto> = emptyList(),
    val topValue: List<BreadthMoverDto> = emptyList(),
)

@Serializable
data class MarketPulseResponse(
    val indices: List<MarketPulseIndexDto> = emptyList(),
    val sectorHeatmap: List<SectorHeatmapDto> = emptyList(),
    val breadth: MarketBreadthDto = MarketBreadthDto(),
)

// --- Stock Screener (GET /api/screener?profile=.., PUBLIK - tanpa login/Pro) ---

@Serializable
data class ScreenerStockDto(
    val ticker: String = "",
    val name: String = "",
    val sector: String = "",
    val per: Double? = null,
    @SerialName("per_sector") val perSector: Double = 0.0,
    @SerialName("rev_growth_5yr") val revGrowth5yr: String = "N/A",
    val roe: String = "N/A",
    val der: String = "N/A",
    @SerialName("div_yield") val divYield: String = "N/A",
    val bandarmology: String = "",
    val moat: String = "",
    @SerialName("target_bull") val targetBull: Double? = null,
    @SerialName("target_bear") val targetBear: Double? = null,
    val entry: Double = 0.0,
    @SerialName("stop_loss") val stopLoss: Double = 0.0,
)

@Serializable
data class ScreenerAnalysisDto(
    @SerialName("top_10_stocks") val top10Stocks: List<ScreenerStockDto> = emptyList(),
)

@Serializable
data class ScreenerResponse(
    val profile: String = "Moderat",
    val analysis: ScreenerAnalysisDto = ScreenerAnalysisDto(),
)

// --- Compare Tool (GET /api/compare?symbol1=..&symbol2=.., butuh login + Pro) ---

@Serializable
data class CompareStockDto(
    val symbol: String = "",
    val price: Double = 0.0,
)

@Serializable
data class CompareRowDto(
    val key: String = "",
    val label: String = "",
    val a: String = "",
    val b: String = "",
    val winner: String = "-",
    val reason: String = "",
)

@Serializable
data class CompareResponse(
    val data1: CompareStockDto = CompareStockDto(),
    val data2: CompareStockDto = CompareStockDto(),
    val rows: List<CompareRowDto> = emptyList(),
    val conclusion: String = "",
)
