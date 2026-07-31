package com.sahamlens.core.network.model

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
