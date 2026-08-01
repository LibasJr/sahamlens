package com.sahamlens.app.tools.screener

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

/** Stock Screener - GET /api/screener PUBLIK (tanpa login/Pro), top 10 saham per profil
 * risiko, di-rank server-side (skor komposit tidak dikirim balik ke client, cuma urutan). */
class ScreenerViewModel(private val toolsRepository: ToolsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ScreenerUiState())
    val uiState: StateFlow<ScreenerUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun selectProfile(profile: RiskProfile) {
        if (profile == _uiState.value.profile) return
        _uiState.update { it.copy(profile = profile) }
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            toolsRepository.getScreener(_uiState.value.profile.apiValue).fold(
                onSuccess = { response -> _uiState.update { it.copy(isLoading = false, stocks = response.analysis.top10Stocks) } },
                onFailure = { _uiState.update { it.copy(isLoading = false, error = "Gagal memuat screener. Coba lagi.") } },
            )
        }
    }

    companion object {
        fun factory(toolsRepository: ToolsRepository) = viewModelFactory {
            initializer { ScreenerViewModel(toolsRepository) }
        }
    }
}
