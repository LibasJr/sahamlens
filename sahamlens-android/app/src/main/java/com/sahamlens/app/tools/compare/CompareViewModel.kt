package com.sahamlens.app.tools.compare

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

/** Compare Tool - GET /api/compare (butuh login + Pro, 402). Kesimpulan &amp; alasan per baris
 * dihitung deterministik di backend dari angka riil (bukan panggilan model bahasa). */
class CompareViewModel(private val toolsRepository: ToolsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(CompareUiState())
    val uiState: StateFlow<CompareUiState> = _uiState.asStateFlow()

    init {
        compare()
    }

    fun onSymbol1Change(value: String) = _uiState.update { it.copy(symbol1 = value.uppercase()) }
    fun onSymbol2Change(value: String) = _uiState.update { it.copy(symbol2 = value.uppercase()) }

    fun compare() {
        val symbol1 = _uiState.value.symbol1.trim()
        val symbol2 = _uiState.value.symbol2.trim()
        if (symbol1.isBlank() || symbol2.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorCode = null) }
            toolsRepository.getCompare(symbol1, symbol2).fold(
                onSuccess = { response -> _uiState.update { it.copy(isLoading = false, result = response) } },
                onFailure = { error ->
                    val code = (error as? HttpException)?.code()
                    _uiState.update { it.copy(isLoading = false, errorCode = code ?: -1) }
                },
            )
        }
    }

    companion object {
        fun factory(toolsRepository: ToolsRepository) = viewModelFactory {
            initializer { CompareViewModel(toolsRepository) }
        }
    }
}
