package com.sahamlens.app.home

/**
 * Bentuk data Home (Build 003). Field ini sengaja dibuat semirip mungkin dengan respons
 * nyata backend (GET /api/v1/portfolio, GET /api/recommendations, GET /api/market-pulse)
 * supaya penggantian ke data asli di Build 007 tinggal isi, bukan desain ulang model.
 */
data class HomeUiState(
    val userName: String,
    val marketOpen: Boolean,
    val aiOpportunityText: String,
    val portfolioValue: Double,
    val portfolioChangePct: Double,
    val indices: List<MarketIndex>,
    val topPicks: List<AiPick>,
    val watchlist: List<WatchlistRow>,
)

data class MarketIndex(val name: String, val changePct: Double)

data class AiPick(val ticker: String, val consensus: String, val confidencePct: Int)

data class WatchlistRow(val ticker: String, val price: Double, val changePct: Double)

/** Sampel jujur untuk pra-Build007 - persis skenario yang dipakai di wireframe Build 003. */
val SampleHomeUiState = HomeUiState(
    userName = "Unison",
    marketOpen = true,
    aiOpportunityText = "Portofolio Anda +2% hari ini. Saya menemukan 5 peluang baru, dan 1 saham sebaiknya dipertimbangkan untuk dijual.",
    portfolioValue = 24_850_000.0,
    portfolioChangePct = 2.04,
    indices = listOf(
        MarketIndex("IHSG", 0.8),
        MarketIndex("LQ45", -0.3),
        MarketIndex("USD/IDR", 0.1),
    ),
    topPicks = listOf(
        AiPick("BBCA", "STRONG BUY", 92),
        AiPick("TINS", "BUY", 78),
        AiPick("INCO", "BUY", 74),
    ),
    watchlist = listOf(
        WatchlistRow("BBCA", 8_925.0, 1.2),
        WatchlistRow("GOTO", 62.0, -2.1),
        WatchlistRow("ANTM", 1_610.0, 0.6),
    ),
)
