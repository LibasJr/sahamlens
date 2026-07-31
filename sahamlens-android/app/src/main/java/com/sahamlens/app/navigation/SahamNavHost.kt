package com.sahamlens.app.navigation

import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.sahamlens.app.aicopilot.AiCopilotScreen
import com.sahamlens.app.home.HomeScreen
import com.sahamlens.app.home.SampleHomeUiState
import com.sahamlens.app.market.MarketScreen
import com.sahamlens.app.portfolio.PortfolioScreen
import com.sahamlens.app.profile.ProfileScreen
import com.sahamlens.app.stockdetail.StockDetailScreen
import com.sahamlens.app.stockdetail.sampleStockDetail
import com.sahamlens.app.ui.showcase.DesignSystemShowcaseScreen
import com.sahamlens.app.watchlist.WatchlistScreen

/** Durasi transisi antar-tab (Build 006 Fade Through) - tab setara, tidak berhierarki, jadi fade bukan slide. */
private const val FADE_THROUGH_MS = 200

/**
 * Build 006 - dibungkus [SharedTransitionLayout] supaya kartu saham di Home dan Hero di
 * Detail Saham bisa berbagi bounds animasi (Shared Element) saat berpindah - kunci berbagi
 * memakai ticker, jadi hanya kartu yang benar-benar diklik yang bermorf.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun SahamNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier,
    homeListState: LazyListState? = null,
    onNavigateToTab: (SahamDestination) -> Unit = { navController.navigate(it.route) },
) {
    SharedTransitionLayout(modifier = modifier) {
        val sharedScope = this

        NavHost(
            navController = navController,
            startDestination = SahamDestination.HOME.route,
            enterTransition = { fadeIn(tween(FADE_THROUGH_MS)) + scaleIn(tween(FADE_THROUGH_MS), initialScale = 0.92f) },
            exitTransition = { fadeOut(tween(FADE_THROUGH_MS)) },
            popEnterTransition = { fadeIn(tween(FADE_THROUGH_MS)) + scaleIn(tween(FADE_THROUGH_MS), initialScale = 0.92f) },
            popExitTransition = { fadeOut(tween(FADE_THROUGH_MS)) },
        ) {
            composable(SahamDestination.HOME.route) {
                HomeScreen(
                    state = SampleHomeUiState,
                    listState = homeListState ?: rememberLazyListState(),
                    sharedTransitionScope = sharedScope,
                    animatedContentScope = this,
                    onStockClick = { ticker -> navController.navigate(SahamNestedRoute.stockDetail(ticker)) },
                    onSeeAllWatchlist = { onNavigateToTab(SahamDestination.WATCHLIST) },
                    onOpenAiCopilot = { onNavigateToTab(SahamDestination.AI) },
                )
            }
            composable(SahamDestination.AI.route) {
                AiCopilotScreen()
            }
            composable(SahamDestination.MARKET.route) { MarketScreen() }
            composable(SahamDestination.PORTFOLIO.route) { PortfolioScreen() }
            composable(SahamDestination.WATCHLIST.route) {
                WatchlistScreen(
                    onStockClick = { ticker -> navController.navigate(SahamNestedRoute.stockDetail(ticker)) },
                )
            }
            composable(SahamDestination.PROFILE.route) {
                ProfileScreen(
                    onOpenDesignSystemShowcase = { navController.navigate(SahamNestedRoute.DESIGN_SYSTEM_SHOWCASE) },
                )
            }

            composable(
                route = SahamNestedRoute.STOCK_DETAIL,
                arguments = listOf(navArgument("ticker") { type = NavType.StringType }),
                enterTransition = { scaleIn(tween(300), initialScale = 0.9f) + fadeIn(tween(300)) },
                exitTransition = { fadeOut(tween(150)) },
                popExitTransition = { scaleOut(tween(200), targetScale = 0.9f) + fadeOut(tween(200)) },
            ) { backStackEntry ->
                val ticker = backStackEntry.arguments?.getString("ticker") ?: "BBCA"
                StockDetailScreen(
                    state = sampleStockDetail(ticker),
                    sharedTransitionScope = sharedScope,
                    animatedContentScope = this,
                    onBack = { navController.popBackStack() },
                )
            }

            composable(SahamNestedRoute.DESIGN_SYSTEM_SHOWCASE) {
                DesignSystemShowcaseScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
