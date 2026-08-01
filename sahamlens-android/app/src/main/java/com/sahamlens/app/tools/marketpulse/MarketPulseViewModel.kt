package com.sahamlens.app.tools.marketpulse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.tools.ToolsRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

/** Market Pulse - GET /api/market-pulse (butuh login + Pro, 402). Beda dari tab Market: Market
 * Pulse membandingkan 4 indeks sekaligus (IHSG/LQ45/IDX30/Kompas100), heatmap 11 sektor, dan
 * rasio advance/decline - tab Market cuma menampilkan top gainer/loser/value 250 saham likuid. */
class MarketPulseViewModel(private val toolsRepository: ToolsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(MarketPulseUiState())
    val uiState: StateFlow<MarketPulseUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorCode = null) }
            toolsRepository.getMarketPulse().fold(
                onSuccess = { response ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            indices = response.indices,
                            sectorHeatmap = response.sectorHeatmap,
                            breadth = response.breadth,
                        )
                    }
                },
                onFailure = { error ->
                    val code = (error as? HttpException)?.code()
                    _uiState.update { it.copy(isLoading = false, errorCode = code ?: -1) }
                },
            )
        }
    }

    companion object {
        fun factory(toolsRepository: ToolsRepository) = viewModelFactory {
            initializer { MarketPulseViewModel(toolsRepository) }
        }
    }
}
