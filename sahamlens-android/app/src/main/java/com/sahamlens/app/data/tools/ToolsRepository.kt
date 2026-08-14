package com.sahamlens.app.data.tools

import com.sahamlens.core.network.SahamLensApi
import com.sahamlens.core.network.model.CompareResponse
import com.sahamlens.core.network.model.MarketPulseResponse
import com.sahamlens.core.network.model.ScreenerResponse

/** Alat analisis lanjutan (Screener/Compare/Market Pulse). Kontrak akses per 2026-08-14:
 * Screener publik penuh. Compare - tamu tanpa login sudah dapat akses penuh sejak 2026-08-13
 * (bisa tetap 402 kalau bukan Pro/trial, tapi TIDAK PERNAH 401 lagi). Market Pulse - publik
 * sepenuhnya, tidak ada gerbang login/Pro sama sekali. Lihat komentar lengkap di
 * [com.sahamlens.core.network.SahamLensApi] untuk rujukan file backend-nya. */
class ToolsRepository(private val api: SahamLensApi) {
    suspend fun getScreener(profile: String): Result<ScreenerResponse> = runCatching { api.getScreener(profile) }

    suspend fun getCompare(symbol1: String, symbol2: String): Result<CompareResponse> =
        runCatching { api.getCompare(symbol1, symbol2) }

    suspend fun getMarketPulse(): Result<MarketPulseResponse> = runCatching { api.getMarketPulse() }
}
