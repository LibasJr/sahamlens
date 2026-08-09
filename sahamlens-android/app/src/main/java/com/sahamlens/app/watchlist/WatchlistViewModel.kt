package com.sahamlens.app.watchlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.watchlist.WatchlistRepository
import com.sahamlens.core.database.watchlist.WatchlistCacheEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class WatchlistUiState(
    val items: List<WatchlistCacheEntity> = emptyList(),
    val isRefreshing: Boolean = true,
    val error: String? = null,
    val lastSyncedAtEpochMillis: Long? = null,
)

/** Build 007 - memuat cache Room seketika, lalu menyegarkan dari jaringan di latar belakang. */
class WatchlistViewModel(private val repository: WatchlistRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(WatchlistUiState())
    val uiState: StateFlow<WatchlistUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.watchlist.collect { items ->
                _uiState.update { state ->
                    state.copy(
                        items = items,
                        lastSyncedAtEpochMillis = items.maxOfOrNull { it.cachedAtEpochMillis },
                    )
                }
            }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            val result = repository.refresh()
            _uiState.update {
                it.copy(
                    isRefreshing = false,
                    error = result.exceptionOrNull()?.let(::describeError),
                )
            }
        }
    }

    private fun describeError(e: Throwable): String {
        val message = e.message.orEmpty()
        return when {
            message.contains("401") -> "Sesi berakhir - silakan login kembali."
            message.contains("HTTP 5") -> "Server sedang bermasalah. Coba lagi sebentar."
            else -> "Gagal memuat data. Cek koneksi internet."
        }
    }

    companion object {
        fun factory(repository: WatchlistRepository) = viewModelFactory {
            initializer { WatchlistViewModel(repository) }
        }
    }
}
