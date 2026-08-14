package com.sahamlens.core.network

import com.sahamlens.core.network.model.AuthMeResponse
import com.sahamlens.core.network.model.ChatRequestDto
import com.sahamlens.core.network.model.ChatResponseDto
import com.sahamlens.core.network.model.CompareResponse
import com.sahamlens.core.network.model.CreateTransactionRequestDto
import com.sahamlens.core.network.model.CreateTransactionResponseDto
import com.sahamlens.core.network.model.DailyPicksResponse
import com.sahamlens.core.network.model.DcfResponse
import com.sahamlens.core.network.model.FundamentalResponse
import com.sahamlens.core.network.model.LiveQuoteDto
import com.sahamlens.core.network.model.LoginRequestDto
import com.sahamlens.core.network.model.LoginResponseDto
import com.sahamlens.core.network.model.MarketPulseResponse
import com.sahamlens.core.network.model.MarketSummaryResponse
import com.sahamlens.core.network.model.PortfolioSummaryResponse
import com.sahamlens.core.network.model.RecommendationsResponse
import com.sahamlens.core.network.model.ScreenerResponse
import com.sahamlens.core.network.model.StockDetailResponse
import com.sahamlens.core.network.model.WatchlistResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Permukaan Retrofit yang MEMANGGIL BACKEND ASLI SahamLens (sahamlens.id, VPS produksi), bukan API
 * tiruan. Diperluas (redesign UI/UX native) dari 4 endpoint (auth+watchlist) ke permukaan
 * yang menutupi Home/Market/Portfolio/StockDetail/AI Council - setiap endpoint dicocokkan
 * satu-satu terhadap route Next.js aslinya di direktori app/api/ (Next.js App Router).
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

    // --- Portfolio (butuh login) ---
    @GET("api/v1/portfolio")
    suspend fun getPortfolio(): PortfolioSummaryResponse

    // Response<T> (bukan CreateTransactionResponseDto langsung) SENGAJA - backend menolak
    // transaksi dengan body {error, code} yang bermakna (cash tidak cukup, lot tidak cukup,
    // harga transaksi tidak wajar - lihat modules/portfolio/types/portfolio.errors.ts), dan
    // pesan itu HARUS sampai ke pengguna, bukan diganti "Transaksi gagal. Coba lagi." generik.
    // Lihat [com.sahamlens.core.network.parseApiError] & PortfolioRepository.buy/sell.
    @POST("api/v1/portfolio/transactions")
    suspend fun createTransaction(@Body request: CreateTransactionRequestDto): Response<CreateTransactionResponseDto>

    // --- Market (publik, tanpa login) ---
    @GET("api/live/{ticker}")
    suspend fun getLiveQuote(@Path("ticker") ticker: String): LiveQuoteDto

    @GET("api/market-summary")
    suspend fun getMarketSummary(): MarketSummaryResponse

    @GET("api/daily-picks")
    suspend fun getDailyPicks(): DailyPicksResponse

    @GET("api/recommendations")
    suspend fun getRecommendations(@Query("symbols") symbols: String): RecommendationsResponse

    // --- Stock Detail (butuh login + Pro) ---
    @GET("api/stock/{ticker}")
    suspend fun getStockDetail(@Path("ticker") ticker: String): StockDetailResponse

    @GET("api/dcf/{ticker}")
    suspend fun getDcf(@Path("ticker") ticker: String): DcfResponse

    // Publik (tanpa login/Pro) - beda dari getStockDetail, dipisah biar Fundamental
    // tetap tampil walau analisis teknikal 402.
    @GET("api/fundamental/{ticker}")
    suspend fun getFundamental(@Path("ticker") ticker: String): FundamentalResponse

    // --- AI Council (tersedia untuk tamu dengan kuota terbatas, lihat guest-chat-quota.ts) ---
    // Response<T> (bukan ChatResponseDto langsung) SENGAJA - server membalas body
    // {role, content, errorCode} yang valid bahkan di status non-2xx (400/429/503/504), dan
    // Retrofit tidak mengekspos body itu sama sekali kalau tipe kembaliannya bukan Response<T>
    // (langsung dilempar sebagai HttpException, body-nya hilang). Lihat ChatRepository.
    @POST("api/chat")
    suspend fun chat(@Body request: ChatRequestDto): Response<ChatResponseDto>

    // --- Alat Analisis (Screener/Compare/Market Pulse) ---
    // Kontrak akses (diverifikasi terhadap backend 2026-08-14): Screener publik penuh (alat
    // gratis). Compare: tamu (tanpa login) sudah dapat akses PENUH sejak keputusan produk
    // 2026-08-13 (lihat hasOpenOrProAccess() di app/api/compare/route.ts) - HANYA 402 (bukan
    // Pro/trial habis) yang masih bisa terjadi, 401 sudah tidak pernah dikirim lagi. Market
    // Pulse: publik SEPENUHNYA, tidak ada gerbang auth/Pro sama sekali (lihat komentar
    // "public-read" di app/api/market-pulse/route.ts) - 401/402 tidak akan pernah terjadi.
    @GET("api/screener")
    suspend fun getScreener(@Query("profile") profile: String): ScreenerResponse

    @GET("api/compare")
    suspend fun getCompare(@Query("symbol1") symbol1: String, @Query("symbol2") symbol2: String): CompareResponse

    @GET("api/market-pulse")
    suspend fun getMarketPulse(): MarketPulseResponse
}
