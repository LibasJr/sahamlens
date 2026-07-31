package com.sahamlens.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Build 002 - enam tujuan Bottom Navigation / Navigation Rail.
 * Ikon outline saat tidak aktif, filled saat aktif (Build 001) - satu ikon satu makna,
 * tidak ada yang dipakai ulang untuk dua tujuan berbeda.
 */
enum class SahamDestination(
    val route: String,
    val label: String,
    val outlinedIcon: ImageVector,
    val filledIcon: ImageVector,
) {
    HOME(
        route = "home",
        label = "Home",
        outlinedIcon = Icons.Outlined.Home,
        filledIcon = Icons.Filled.Home,
    ),
    AI(
        route = "ai_copilot",
        label = "AI",
        outlinedIcon = Icons.Outlined.AutoAwesome,
        filledIcon = Icons.Filled.AutoAwesome,
    ),
    MARKET(
        route = "market",
        label = "Market",
        outlinedIcon = Icons.AutoMirrored.Outlined.TrendingUp,
        filledIcon = Icons.AutoMirrored.Filled.TrendingUp,
    ),
    PORTFOLIO(
        route = "portfolio",
        label = "Portfolio",
        outlinedIcon = Icons.Outlined.AccountBalanceWallet,
        filledIcon = Icons.Filled.AccountBalanceWallet,
    ),
    WATCHLIST(
        route = "watchlist",
        label = "Watchlist",
        outlinedIcon = Icons.Outlined.BookmarkBorder,
        filledIcon = Icons.Filled.Bookmark,
    ),
    PROFILE(
        route = "profile",
        label = "Profil",
        outlinedIcon = Icons.Outlined.Person,
        filledIcon = Icons.Filled.Person,
    ),
    ;

    companion object {
        /** Tampil di FAB "Tanya AI" (Build 001) hanya di layar yang relevan. */
        val fabEligibleRoutes = setOf(HOME.route)
    }
}

/** Rute bersarang, bukan tujuan Bottom Nav - dijangkau lewat kartu saham atau FAB kontekstual. */
object SahamNestedRoute {
    const val STOCK_DETAIL = "stock_detail/{ticker}"
    fun stockDetail(ticker: String) = "stock_detail/$ticker"
    const val DESIGN_SYSTEM_SHOWCASE = "design_system_showcase"
}
