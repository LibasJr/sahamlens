package com.sahamlens.app.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.auth.AuthRepository
import com.sahamlens.app.data.market.MarketRepository
import com.sahamlens.app.data.portfolio.PortfolioRepository
import com.sahamlens.app.data.watchlist.WatchlistRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** 1 lot = 100 lembar saham (LOT_SIZE di modules/portfolio/constants/portfolio.constants.ts). */
private const val LOT_SIZE = 100

/**
 * Home - menggabungkan Portfolio (nilai posisi terkini, bukan cuma modal), Market (IHSG +
 * kategori "Hari Ini AI Menemukan"), dan Watchlist (cache-first, repository yang sudah ada)
 * jadi satu ringkasan yang bisa dibaca habis dalam 10 detik. Setiap bagian punya flag loading
 * sendiri supaya satu bagian lambat (mis. Portfolio nunggu banyak live quote) tidak menahan
 * bagian lain yang sudah siap tampil.
 */
class HomeViewModel(
    private val authRepository: AuthRepository,
    private val portfolioRepository: PortfolioRepository,
    private val marketRepository: MarketRepository,
    watchlistRepository: WatchlistRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        _uiState.update { it.copy(userName = authRepository.userEmail.value?.substringBefore("@") ?: "Investor") }

        viewModelScope.launch {
            watchlistRepository.watchlist.collect { items ->
                val top3 = items.take(3)
                val quotes = if (top3.isNotEmpty()) marketRepository.getLiveQuotes(top3.map { it.symbol }) else emptyMap()
                _uiState.update { state ->
                    state.copy(
                        isLoadingWatchlist = false,
                        watchlist = top3.map { row ->
                            val quote = quotes[row.symbol]
                            WatchlistRow(row.symbol, quote?.price ?: 0.0, quote?.changePercent ?: 0.0)
                        },
                    )
                }
            }
        }

        loadPortfolio()
        loadMarket()
    }

    private fun loadPortfolio() {
        viewModelScope.launch {
            val result = portfolioRepository.getSummary()
            val data = result.getOrNull()
            if (data == null) {
                _uiState.update { it.copy(isLoadingPortfolio = false) }
                return@launch
            }
            val symbols = data.holdings.map { it.symbol }
            val quotes = if (symbols.isNotEmpty()) marketRepository.getLiveQuotes(symbols) else emptyMap()

            val totalCost = data.holdings.sumOf { it.totalCost }
            val currentValue = data.holdings.sumOf { h ->
                val price = quotes[h.symbol]?.price ?: (h.totalCost / (h.lots * LOT_SIZE).coerceAtLeast(1))
                h.lots * LOT_SIZE * price
            }
            val totalValue = currentValue + data.portfolio.cash
            val changePct = if (totalCost > 0) ((currentValue - totalCost) / totalCost) * 100 else 0.0

            _uiState.update {
                it.copy(
                    isLoadingPortfolio = false,
                    portfolioValue = totalValue,
                    portfolioChangePct = changePct,
                )
            }
            buildAiOpportunityText()
        }
    }

    private fun loadMarket() {
        viewModelScope.launch {
            val ihsg = marketRepository.getIhsg().getOrNull()
            _uiState.update { it.copy(ihsgPrice = ihsg?.price, ihsgChangePct = ihsg?.changePercent) }

            val summary = marketRepository.getSummary().getOrNull()
            val picks = summary?.topTechnical?.take(3)?.map { row ->
                AiPick(ticker = row.symbol, consensus = "BUY", confidencePct = row.score)
            } ?: emptyList()
            _uiState.update { it.copy(isLoadingMarket = false, topPicks = picks) }
            buildAiOpportunityText()
        }
    }

    /** Sapaan "AI menemukan peluang hari ini" - dirangkai dari data yang SUDAH nyata (Portfolio
     * P/L + jumlah saham menarik hari ini), bukan kalimat tetap yang ditulis di kode. */
    private fun buildAiOpportunityText() {
        _uiState.update { state ->
            if (state.isLoadingPortfolio || state.isLoadingMarket) return@update state
            val pnlPart = state.portfolioChangePct?.let { pct ->
                val word = if (pct >= 0) "naik" else "turun"
                "Portofolio Anda $word ${"%.1f".format(kotlin.math.abs(pct))}% hari ini. "
            } ?: ""
            val picksPart = if (state.topPicks.isNotEmpty()) {
                "Saya menemukan ${state.topPicks.size} saham dengan sinyal bullish kuat hari ini."
            } else {
                "Belum ada sinyal bullish kuat yang terdeteksi hari ini."
            }
            state.copy(aiOpportunityText = pnlPart + picksPart)
        }
    }

    companion object {
        fun factory(
            authRepository: AuthRepository,
            portfolioRepository: PortfolioRepository,
            marketRepository: MarketRepository,
            watchlistRepository: WatchlistRepository,
        ) = viewModelFactory {
            initializer { HomeViewModel(authRepository, portfolioRepository, marketRepository, watchlistRepository) }
        }
    }
}
