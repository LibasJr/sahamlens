package com.sahamlens.app.data.auth

import com.sahamlens.core.network.SahamLensApi
import com.sahamlens.core.network.SessionCookieJar
import com.sahamlens.core.network.model.LoginRequestDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Titik satu-satunya untuk status sesi login - inilah "sambungan ke backend" yang tadinya
 * hilang: tanpa ini, cookie sesi ([SessionCookieJar]) selalu kosong dan setiap panggilan API
 * yang butuh login (Watchlist, Portfolio, dst.) pasti 401.
 *
 * [isLoggedIn] null berarti belum dicek sama sekali (splash/loading), true/false setelah
 * pengecekan pertama selesai. UI (root navigasi) mengamati ini secara reaktif - login/logout
 * di mana pun cukup mengubah state di sini, tidak perlu callback manual berlapis-lapis.
 */
class AuthRepository(
    private val api: SahamLensApi,
    private val cookieJar: SessionCookieJar,
) {
    private val _isLoggedIn = MutableStateFlow<Boolean?>(null)
    val isLoggedIn: StateFlow<Boolean?> = _isLoggedIn.asStateFlow()

    private val _userEmail = MutableStateFlow<String?>(null)
    val userEmail: StateFlow<String?> = _userEmail.asStateFlow()

    private val _userRole = MutableStateFlow<String?>(null)
    val userRole: StateFlow<String?> = _userRole.asStateFlow()

    /** Dipanggil sekali saat app dibuka - cek apakah sesi (jika ada) masih valid di server. */
    suspend fun checkSession() {
        val me = runCatching { api.getMe() }.getOrNull()
        _isLoggedIn.value = me?.authenticated == true
        _userEmail.value = me?.user?.email
        _userRole.value = me?.user?.role
    }

    suspend fun login(email: String, password: String): Result<Unit> = runCatching {
        api.login(LoginRequestDto(email = email.trim(), password = password))
        checkSession()
        check(_isLoggedIn.value == true) { "Login gagal" }
    }

    suspend fun logout() {
        runCatching { api.logout() }
        cookieJar.clear()
        _isLoggedIn.value = false
        _userEmail.value = null
        _userRole.value = null
    }
}
