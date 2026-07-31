package com.sahamlens.core.network

import com.sahamlens.core.network.model.AuthMeResponse
import com.sahamlens.core.network.model.LoginRequestDto
import com.sahamlens.core.network.model.LoginResponseDto
import com.sahamlens.core.network.model.WatchlistResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/**
 * Build 007 - permukaan Retrofit yang MEMANGGIL BACKEND ASLI SahamLens (sahamlens.vercel.app),
 * bukan API tiruan. Dibatasi ke endpoint yang benar-benar dipakai contoh nyata (Watchlist +
 * autentikasi) - permukaan penuh (Portfolio, Recommendations, Market Pulse, dst.) menyusul
 * di Build 010 saat modul :feature:* dibentuk, supaya tidak ada kode yang menganggur.
 */
interface SahamLensApi {
    @GET("api/auth/me")
    suspend fun getMe(): AuthMeResponse

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequestDto): LoginResponseDto

    @POST("api/auth/logout")
    suspend fun logout()

    @GET("api/v1/watchlists")
    suspend fun getWatchlist(): WatchlistResponse
}
