package com.sahamlens.app.data.tools

import com.sahamlens.core.network.SahamLensApi
import com.sahamlens.core.network.model.CompareResponse
import com.sahamlens.core.network.model.MarketPulseResponse
import com.sahamlens.core.network.model.ScreenerResponse

/** Alat analisis lanjutan (Screener/Compare/Market Pulse) - beda dari [com.sahamlens.app.data.market.MarketRepository]
 * karena TIDAK semua endpoint di sini publik: Screener publik (alat gratis), tapi Compare
 * dan Market Pulse butuh login + akun Pro (402), sama seperti StockDetailRepository. */
class ToolsRepository(private val api: SahamLensApi) {
    suspend fun getScreener(profile: String): Result<ScreenerResponse> = runCatching { api.getScreener(profile) }

    suspend fun getCompare(symbol1: String, symbol2: String): Result<CompareResponse> =
        runCatching { api.getCompare(symbol1, symbol2) }

    suspend fun getMarketPulse(): Result<MarketPulseResponse> = runCatching { api.getMarketPulse() }
}
