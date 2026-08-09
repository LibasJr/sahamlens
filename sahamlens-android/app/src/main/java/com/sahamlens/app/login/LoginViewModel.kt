package com.sahamlens.app.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.auth.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val error: String? = null,
)

/**
 * Build 007 (lanjutan) - inilah sambungan nyata ke backend yang tadinya hilang: setelah
 * [submit] sukses, [AuthRepository.isLoggedIn] berubah jadi true, dan root navigasi (yang
 * mengamati state itu) otomatis pindah ke app utama - tidak ada navigasi manual di sini.
 */
class LoginViewModel(private val repository: AuthRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.update { it.copy(email = value, error = null) }
    }

    fun onPasswordChange(value: String) {
        _uiState.update { it.copy(password = value, error = null) }
    }

    fun submit() {
        val current = _uiState.value
        if (current.email.isBlank() || current.password.isBlank()) {
            _uiState.update { it.copy(error = "Email dan password wajib diisi.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val result = repository.login(current.email, current.password)
            _uiState.update {
                it.copy(
                    isLoading = false,
                    error = result.exceptionOrNull()?.let(::describeError),
                )
            }
        }
    }

    private fun describeError(e: Throwable): String {
        val message = e.message.orEmpty()
        return when {
            message.contains("401") || message.contains("400") -> "Email atau password salah."
            message.contains("HTTP 5") -> "Server sedang bermasalah. Coba lagi sebentar."
            else -> "Gagal masuk. Cek koneksi internet."
        }
    }

    companion object {
        fun factory(repository: AuthRepository) = viewModelFactory {
            initializer { LoginViewModel(repository) }
        }
    }
}
