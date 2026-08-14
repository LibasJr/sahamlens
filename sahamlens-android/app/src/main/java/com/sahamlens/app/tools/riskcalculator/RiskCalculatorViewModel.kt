package com.sahamlens.app.tools.riskcalculator

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.market.MarketRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class RiskCalculatorViewModel(private val marketRepository: MarketRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(RiskCalculatorUiState())
    val uiState: StateFlow<RiskCalculatorUiState> = _uiState.asStateFlow()

    fun onSymbolChange(value: String) = _uiState.update { it.copy(symbol = value.uppercase()) }
    fun onModalChange(value: String) = _uiState.update { it.copy(modal = value.filter(Char::isDigit)) }
    fun onRiskPctChange(value: String) = _uiState.update { it.copy(riskPct = value) }
    fun onEntryChange(value: String) = _uiState.update { it.copy(entry = value) }
    fun onStopLossChange(value: String) = _uiState.update { it.copy(stopLoss = value) }
    fun onTargetChange(value: String) = _uiState.update { it.copy(target = value) }

    /** Prefill Harga Entry dari kutipan live - opsional, boleh ditimpa manual, sama seperti web.
     * BUG FIX: dulu kegagalan fetch (simbol tidak dikenal, jaringan gagal) diam-diam - `entry`
     * tetap nilai lama dan tombol "Live" terlihat seperti tidak melakukan apa-apa. Sekarang
     * [RiskCalculatorUiState.priceError] diisi supaya layar bisa memberi tahu pengguna. */
    fun fetchLivePrice() {
        val symbol = _uiState.value.symbol.trim()
        if (symbol.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingPrice = true, priceError = null) }
            val price = marketRepository.getLiveQuotes(listOf(symbol))[symbol]?.price
            _uiState.update {
                it.copy(
                    isLoadingPrice = false,
                    entry = price?.let { p -> "%.0f".format(p) } ?: it.entry,
                    priceError = if (price == null) "Gagal ambil harga live untuk \"$symbol\". Cek simbolnya atau isi manual." else null,
                )
            }
        }
    }

    companion object {
        fun factory(marketRepository: MarketRepository) = viewModelFactory {
            initializer { RiskCalculatorViewModel(marketRepository) }
        }
    }
}
