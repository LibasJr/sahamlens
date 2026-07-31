package com.sahamlens.app

import android.app.Application
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.sahamlens.app.data.AppGraph
import com.sahamlens.app.sync.WatchlistSyncWorker
import java.util.concurrent.TimeUnit

class SahamLensApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppGraph.init(this)
        scheduleWatchlistSync()
    }

    /** Build 007 - Background Sync, 15 menit adalah interval minimum yang diizinkan Android untuk periodic work. */
    private fun scheduleWatchlistSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = PeriodicWorkRequestBuilder<WatchlistSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "watchlist_sync",
            ExistingPeriodicWorkPolicy.KEEP,
            request,
        )
    }
}
