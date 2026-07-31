package com.sahamlens.app.data.watchlist

import com.sahamlens.core.database.watchlist.WatchlistCacheEntity
import com.sahamlens.core.database.watchlist.WatchlistDao
import com.sahamlens.core.network.SahamLensApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow

/**
 * Build 007 - contoh nyata cache-first / stale-while-revalidate: Room ([dao]) adalah satu-
 * satunya sumber kebenaran yang dibaca UI ([watchlist]); [refresh] memanggil backend asli lalu
 * menimpa cache. UI selalu bisa menampilkan sesuatu SEGERA dari cache sebelum jaringan selesai.
 */
class WatchlistRepository(
    private val api: SahamLensApi,
    private val dao: WatchlistDao,
) {
    val watchlist: Flow<List<WatchlistCacheEntity>> = dao.observeAll()

    suspend fun refresh(): Result<Unit> = runCatching {
        val response = api.getWatchlist()
        val now = System.currentTimeMillis()
        val entities = response.data.map { item ->
            WatchlistCacheEntity(
                symbol = item.symbol,
                buyPrice = item.buyPrice,
                alertPrice = item.alertPrice,
                lot = item.lot,
                cachedAtEpochMillis = now,
            )
        }
        dao.replaceAll(entities)
    }

    /**
     * Dipakai jalur otomatis (WorkManager) - backoff eksponensial 1-2-4-8 detik, batas 30 detik
     * (Build 007). Retry manual (tombol/pull-to-refresh di UI) TIDAK memakai ini - selalu coba
     * langsung, tanpa jeda, karena itu keputusan sadar pengguna, bukan proses latar belakang.
     */
    suspend fun refreshWithBackoff(maxAttempts: Int = 4): Result<Unit> {
        var attempt = 0
        var delayMs = 1000L
        var lastResult: Result<Unit> = Result.failure(IllegalStateException("Belum dicoba"))
        while (attempt < maxAttempts) {
            lastResult = refresh()
            if (lastResult.isSuccess) return lastResult
            attempt++
            if (attempt < maxAttempts) {
                delay(delayMs)
                delayMs = (delayMs * 2).coerceAtMost(30_000L)
            }
        }
        return lastResult
    }
}
