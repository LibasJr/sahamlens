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
import retrofit2.HttpException

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

    // BUG FIX: sebelumnya mencocokkan substring "401"/"400"/"HTTP 5" di HttpException.message
    // (rapuh - kebetulan cocok karena format bawaan Retrofit "HTTP 401 Unauthorized" memuat
    // digit itu). 403 (akun belum diverifikasi email - lihat EmailNotVerifiedError di backend
    // modules/user/service/auth.service.ts) tidak match satu pun cabang lama dan jatuh ke
    // "Gagal masuk. Cek koneksi internet." - pesan yang salah total untuk user yang password-nya
    // sudah benar. Baca kode HTTP asli lewat HttpException.code(), pola yang sama dengan
    // StockDetailViewModel/CompareViewModel/MarketPulseViewModel.
    private fun describeError(e: Throwable): String {
        val code = (e as? HttpException)?.code()
        return when {
            code == 401 || code == 400 -> "Email atau password salah."
            code == 403 -> "Akun belum diverifikasi. Cek email Anda untuk tautan verifikasi."
            code != null && code >= 500 -> "Server sedang bermasalah. Coba lagi sebentar."
            else -> "Gagal masuk. Cek koneksi internet."
        }
    }

    companion object {
        fun factory(repository: AuthRepository) = viewModelFactory {
            initializer { LoginViewModel(repository) }
        }
    }
}
