package com.sahamlens.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.sahamlens.app.data.AppGraph

/**
 * Build 007 - Background Sync. Dijadwalkan periodik (lihat SahamLensApplication) untuk
 * menyegarkan Watchlist walau app tidak dibuka - jarak minimum WorkManager untuk periodic
 * work adalah 15 menit (batas sistem Android, bukan pilihan sewenang-wenang).
 */
class WatchlistSyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val outcome = AppGraph.watchlistRepository.refreshWithBackoff(maxAttempts = 2)
        return if (outcome.isSuccess) Result.success() else Result.retry()
    }
}
