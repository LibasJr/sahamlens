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
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Permukaan Retrofit yang MEMANGGIL BACKEND ASLI SahamLens (sahamlens.vercel.app), bukan API
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

    @POST("api/v1/portfolio/transactions")
    suspend fun createTransaction(@Body request: CreateTransactionRequestDto): CreateTransactionResponseDto

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

    // --- AI Council (butuh login) ---
    @POST("api/chat")
    suspend fun chat(@Body request: ChatRequestDto): ChatResponseDto

    // --- Alat Analisis (Screener/Compare/Market Pulse) ---
    // Screener publik (alat gratis), Compare & Market Pulse butuh login + Pro (402).
    @GET("api/screener")
    suspend fun getScreener(@Query("profile") profile: String): ScreenerResponse

    @GET("api/compare")
    suspend fun getCompare(@Query("symbol1") symbol1: String, @Query("symbol2") symbol2: String): CompareResponse

    @GET("api/market-pulse")
    suspend fun getMarketPulse(): MarketPulseResponse
}
