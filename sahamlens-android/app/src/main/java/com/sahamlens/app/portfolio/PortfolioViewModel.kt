package com.sahamlens.app.portfolio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.market.MarketRepository
import com.sahamlens.app.data.portfolio.PortfolioRepository
import com.sahamlens.core.network.model.HoldingDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val LOT_SIZE = 100

data class HoldingRow(
    val symbol: String,
    val lots: Int,
    val avgPrice: Double,
    val currentPrice: Double,
    val totalCost: Double,
    val currentValue: Double,
    val pnlPct: Double,
)

data class PortfolioUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val cash: Double = 0.0,
    val totalCost: Double = 0.0,
    val totalValue: Double = 0.0,
    val totalPnlPct: Double = 0.0,
    val holdings: List<HoldingRow> = emptyList(),
)

/** Portfolio (Akun Demo) - GET /api/v1/portfolio (modal & lot) + GET /api/live/[ticker] per
 * simbol holding (harga terkini) supaya P/L yang ditampilkan riil, bukan cuma modal awal. */
class PortfolioViewModel(
    private val portfolioRepository: PortfolioRepository,
    private val marketRepository: MarketRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(PortfolioUiState())
    val uiState: StateFlow<PortfolioUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val result = portfolioRepository.getSummary()
            val data = result.getOrNull()
            if (data == null) {
                _uiState.update { it.copy(isLoading = false, error = "Gagal memuat portofolio. Cek koneksi internet.") }
                return@launch
            }

            val quotes = if (data.holdings.isNotEmpty()) {
                marketRepository.getLiveQuotes(data.holdings.map { it.symbol })
            } else {
                emptyMap()
            }

            val rows = data.holdings.map { h -> buildRow(h, quotes[h.symbol]?.price) }
            val totalCost = rows.sumOf { it.totalCost }
            val totalValue = rows.sumOf { it.currentValue } + data.portfolio.cash
            val pnlPct = if (totalCost > 0) ((rows.sumOf { it.currentValue } - totalCost) / totalCost) * 100 else 0.0

            _uiState.update {
                it.copy(
                    isLoading = false,
                    cash = data.portfolio.cash,
                    totalCost = totalCost,
                    totalValue = totalValue,
                    totalPnlPct = pnlPct,
                    holdings = rows,
                )
            }
        }
    }

    private fun buildRow(h: HoldingDto, livePrice: Double?): HoldingRow {
        val price = livePrice ?: h.avgPrice
        val currentValue = h.lots * LOT_SIZE * price
        val pnlPct = if (h.totalCost > 0) ((currentValue - h.totalCost) / h.totalCost) * 100 else 0.0
        return HoldingRow(
            symbol = h.symbol,
            lots = h.lots,
            avgPrice = h.avgPrice,
            currentPrice = price,
            totalCost = h.totalCost,
            currentValue = currentValue,
            pnlPct = pnlPct,
        )
    }

    companion object {
        fun factory(portfolioRepository: PortfolioRepository, marketRepository: MarketRepository) = viewModelFactory {
            initializer { PortfolioViewModel(portfolioRepository, marketRepository) }
        }
    }
}
