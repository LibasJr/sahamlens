package com.sahamlens.app.data

import android.content.Context
import com.sahamlens.app.data.auth.AuthRepository
import com.sahamlens.app.data.watchlist.WatchlistRepository
import com.sahamlens.core.database.SahamLensDatabase
import com.sahamlens.core.network.NetworkModule

/**
 * Penyedia dependency manual (Build 007) - dipakai sementara sampai Hilt terpasang penuh di
 * Build 010. Satu tempat, satu inisialisasi di [com.sahamlens.app.SahamLensApplication].
 */
object AppGraph {
    private lateinit var appContext: Context

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    val authRepository: AuthRepository by lazy {
        AuthRepository(
            api = NetworkModule.api,
            cookieJar = NetworkModule.sessionCookieJar,
        )
    }

    val watchlistRepository: WatchlistRepository by lazy {
        WatchlistRepository(
            api = NetworkModule.api,
            dao = SahamLensDatabase.getInstance(appContext).watchlistDao(),
        )
    }
}
