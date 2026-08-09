package com.sahamlens.app.market

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.market.MarketRepository
import com.sahamlens.core.network.model.MarketStockRowDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MarketUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val ihsgPrice: Double? = null,
    val ihsgChangePct: Double? = null,
    val topGainers: List<MarketStockRowDto> = emptyList(),
    val topLosers: List<MarketStockRowDto> = emptyList(),
    val topValue: List<MarketStockRowDto> = emptyList(),
    val bullishCount: Int = 0,
    val bearishCount: Int = 0,
)

/** Market - SEMUA data publik (GET /api/live/^JKSE + /api/market-summary), tanpa login,
 * supaya tab ini tetap berguna sebelum user login (konsisten dengan Watchlist cache-first:
 * error tidak pernah mengosongkan layar kalau ada data sebelumnya). */
class MarketViewModel(private val repository: MarketRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(MarketUiState())
    val uiState: StateFlow<MarketUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            val ihsg = repository.getIhsg().getOrNull()
            val summaryResult = repository.getSummary()
            val summary = summaryResult.getOrNull()

            if (summary == null) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = "Gagal memuat data pasar. Cek koneksi internet.",
                        ihsgPrice = ihsg?.price ?: it.ihsgPrice,
                        ihsgChangePct = ihsg?.changePercent ?: it.ihsgChangePct,
                    )
                }
                return@launch
            }

            _uiState.update {
                it.copy(
                    isLoading = false,
                    error = null,
                    ihsgPrice = ihsg?.price,
                    ihsgChangePct = ihsg?.changePercent,
                    topGainers = summary.topGainers.take(10),
                    topLosers = summary.topLosers.take(10),
                    topValue = summary.topValue.take(10),
                    bullishCount = summary.topTechnical.size,
                    bearishCount = summary.topTechnicalBearish.size,
                )
            }
        }
    }

    companion object {
        fun factory(repository: MarketRepository) = viewModelFactory {
            initializer { MarketViewModel(repository) }
        }
    }
}
