package com.sahamlens.app.data.market

import com.sahamlens.core.network.SahamLensApi
import com.sahamlens.core.network.model.DailyPicksResponse
import com.sahamlens.core.network.model.LiveQuoteDto
import com.sahamlens.core.network.model.MarketSummaryResponse
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

/** Market & ringkasan indeks - SEMUA endpoint di sini publik (tanpa login), sengaja
 * dipisah dari Portfolio/StockDetail supaya Home & Market tetap bisa menampilkan sesuatu
 * sebelum user login (konsisten dengan filosofi "cari saham tanpa perlu login" di web). */
class MarketRepository(private val api: SahamLensApi) {
    suspend fun getIhsg(): Result<LiveQuoteDto> = runCatching { api.getLiveQuote("^JKSE") }

    suspend fun getSummary(): Result<MarketSummaryResponse> = runCatching { api.getMarketSummary() }

    suspend fun getDailyPicks(): Result<DailyPicksResponse> = runCatching { api.getDailyPicks() }

    /** Dipakai Portfolio/Home untuk menghitung nilai posisi terkini - GET /api/live/[ticker]
     * dipanggil paralel per simbol holding (bukan endpoint batch, backend belum menyediakannya). */
    suspend fun getLiveQuotes(symbols: List<String>): Map<String, LiveQuoteDto> = coroutineScope {
        symbols.distinct().map { symbol ->
            async { symbol to runCatching { api.getLiveQuote(symbol) }.getOrNull() }
        }.map { it.await() }
            .mapNotNull { (symbol, quote) -> quote?.let { symbol to it } }
            .toMap()
    }
}
