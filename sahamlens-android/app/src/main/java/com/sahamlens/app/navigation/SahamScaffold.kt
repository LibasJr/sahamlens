package com.sahamlens.app.navigation

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState

/**
 * Build 002 - Bottom Navigation di ponsel (compact), Navigation Rail di tablet/foldable
 * (breakpoint M3 standar >= 600dp / medium+). FAB "Tanya AI" hanya di rute yang layak
 * (Build 001: bukan tombol generik di semua layar), dan mengecil jadi ikon-saja saat
 * pengguna scroll ke bawah (Build 006 - beri ruang baca, extended lagi saat scroll naik).
 */
@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
fun SahamAppScaffold(
    navController: NavHostController,
    windowSizeClass: WindowSizeClass,
    modifier: Modifier = Modifier,
) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.hierarchy?.firstOrNull { destination ->
        SahamDestination.entries.any { it.route == destination.route }
    }?.route

    val isExpanded = windowSizeClass.widthSizeClass != WindowWidthSizeClass.Compact
    val showFab = currentRoute in SahamDestination.fabEligibleRoutes

    val homeListState = rememberLazyListState()
    // FAB extended hanya saat dekat puncak (indeks 0, offset kecil) - derivedStateOf murni
    // membaca listState tanpa menulis state lain di dalamnya (hindari anti-pattern "efek
    // samping di dalam kalkulasi derivedStateOf" yang bisa bikin nilai FAB tidak konsisten).
    val fabExtended by remember {
        derivedStateOf {
            homeListState.firstVisibleItemIndex == 0 && homeListState.firstVisibleItemScrollOffset < 40
        }
    }

    fun navigateToTab(destination: SahamDestination) {
        navController.navigate(destination.route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    if (isExpanded) {
        Row(modifier = modifier.fillMaxSize()) {
            NavigationRail {
                SahamDestination.entries.forEach { destination ->
                    val selected = currentRoute == destination.route
                    NavigationRailItem(
                        selected = selected,
                        onClick = { navigateToTab(destination) },
                        icon = {
                            Icon(
                                imageVector = if (selected) destination.filledIcon else destination.outlinedIcon,
                                contentDescription = destination.label,
                            )
                        },
                        label = { Text(destination.label) },
                    )
                }
                if (showFab) {
                    FloatingActionButton(onClick = { navigateToTab(SahamDestination.AI) }) {
                        Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = "AI Council")
                    }
                }
            }
            SahamNavHost(
                navController = navController,
                modifier = Modifier.fillMaxSize(),
                homeListState = homeListState,
                onNavigateToTab = ::navigateToTab,
            )
        }
    } else {
        Scaffold(
            modifier = modifier,
            bottomBar = {
                NavigationBar {
                    SahamDestination.entries.forEach { destination ->
                        val selected = currentRoute == destination.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = { navigateToTab(destination) },
                            icon = {
                                Icon(
                                    imageVector = if (selected) destination.filledIcon else destination.outlinedIcon,
                                    contentDescription = destination.label,
                                )
                            },
                            label = { Text(destination.label) },
                        )
                    }
                }
            },
            floatingActionButton = {
                if (showFab) {
                    AnimatedContent(
                        targetState = fabExtended,
                        transitionSpec = { fadeIn(tween(150)) togetherWith fadeOut(tween(150)) },
                        label = "fab-collapse",
                    ) { extended ->
                        if (extended) {
                            ExtendedFloatingActionButton(
                                onClick = { navigateToTab(SahamDestination.AI) },
                                icon = { Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = null) },
                                text = { Text("AI Council") },
                            )
                        } else {
                            FloatingActionButton(onClick = { navigateToTab(SahamDestination.AI) }) {
                                Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = "AI Council")
                            }
                        }
                    }
                }
            },
        ) { innerPadding ->
            // Beberapa tujuan (StockDetail, AI Copilot, Design System Showcase) punya
            // Scaffold/TopAppBar sendiri di dalam - padding ini terutama menjaga layar
            // tanpa Scaffold sendiri (Home, Market, Portfolio, Watchlist, Profil) tidak
            // tertutup Bottom Navigation.
            SahamNavHost(
                navController = navController,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = innerPadding.calculateBottomPadding()),
                homeListState = homeListState,
            )
        }
    }
}
