package com.sahamlens.app.home

/**
 * Bentuk data Home - diisi dari data REAL (GET /api/v1/portfolio, /api/market-summary,
 * /api/daily-picks, /api/live/^JKSE, plus Watchlist repository yang sudah ada) lewat
 * [HomeViewModel]. Field nullable = "belum termuat", BUKAN nol/kosong yang dikarang.
 */
data class HomeUiState(
    val userName: String = "",
    val isLoadingPortfolio: Boolean = true,
    val isLoadingMarket: Boolean = true,
    val isLoadingWatchlist: Boolean = true,
    val portfolioValue: Double? = null,
    val portfolioChangePct: Double? = null,
    val ihsgPrice: Double? = null,
    val ihsgChangePct: Double? = null,
    val aiOpportunityText: String? = null,
    val topPicks: List<AiPick> = emptyList(),
    val watchlist: List<WatchlistRow> = emptyList(),
    val newsHeadline: String? = null,
)

data class MarketIndex(val name: String, val changePct: Double)

data class AiPick(val ticker: String, val consensus: String, val confidencePct: Int)

data class WatchlistRow(val ticker: String, val price: Double, val changePct: Double)
