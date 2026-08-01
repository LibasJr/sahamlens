package com.sahamlens.app.data

import android.content.Context
import com.sahamlens.app.data.auth.AuthRepository
import com.sahamlens.app.data.chat.ChatRepository
import com.sahamlens.app.data.market.MarketRepository
import com.sahamlens.app.data.portfolio.PortfolioRepository
import com.sahamlens.app.data.stockdetail.StockDetailRepository
import com.sahamlens.app.data.tools.ToolsRepository
import com.sahamlens.app.data.watchlist.WatchlistRepository
import com.sahamlens.core.database.SahamLensDatabase
import com.sahamlens.core.network.NetworkModule

/**
 * Penyedia dependency manual - dipakai sementara sampai Hilt terpasang penuh (keputusan sadar:
 * AppGraph sudah teruji jalan untuk Login+Watchlist, migrasi Hilt murni-refactor berisiko tanpa
 * manfaat fungsional baru, jadi ditunda sampai ada modul :feature:* yang benar-benar butuh
 * scoping DI per-fitur). Satu tempat, satu inisialisasi di [com.sahamlens.app.SahamLensApplication].
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

    val portfolioRepository: PortfolioRepository by lazy { PortfolioRepository(NetworkModule.api) }

    val marketRepository: MarketRepository by lazy { MarketRepository(NetworkModule.api) }

    val stockDetailRepository: StockDetailRepository by lazy { StockDetailRepository(NetworkModule.api) }

    val chatRepository: ChatRepository by lazy { ChatRepository(NetworkModule.api) }

    val toolsRepository: ToolsRepository by lazy { ToolsRepository(NetworkModule.api) }
}
