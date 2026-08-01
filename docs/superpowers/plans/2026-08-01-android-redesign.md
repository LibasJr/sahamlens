# SahamLens Android Redesign — Navigasi & Layar Analisis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti Bottom Navigation Android jadi Navigation Drawer terkelompok (mirror `Sidebar.tsx` web), pisahkan Technical/Fundamental Analyzer & AI Pick jadi layar mandiri, pisahkan Stock Detail mode Analisis vs Akun Demo, dan restyle Home/Watchlist — sesuai `docs/superpowers/specs/2026-08-01-android-redesign-design.md`.

**Architecture:** 8 Build incremental (Build 008-015, lanjutan Build 001-007 yang sudah ada), tiap Build menghasilkan state yang compile & jalan sendiri (konvensi project ini, lihat `.claude/error-learning/errors.md`). Tidak ada modul Gradle baru kecuali dependency DataStore di `:core:database` yang sudah ada.

**Tech Stack:** Kotlin, Jetpack Compose, Navigation Compose, Material3 (`ModalNavigationDrawer`/`PermanentNavigationDrawer`), Retrofit + kotlinx.serialization, Room, WorkManager, DataStore Preferences (baru).

## Global Constraints

- Tidak ada test runner (JUnit) di project ini sekarang — verifikasi tiap task pakai `./gradlew :app:compileDebugKotlin` (atau `assembleDebug` untuk task yang mengubah resource/manifest) + jalan di emulator/device untuk cek manual. Ini mengikuti pola yang SUDAH ada di project (BUILD SUCCESSFUL via Gradle, bukan unit test), bukan penyimpangan dari skill.
- Tidak menambah endpoint backend baru. Semua data lewat endpoint yang sudah ada di `SahamLensApi.kt`, KECUALI `GET api/breakout-radar` yang sudah ada di backend (`app/api/breakout-radar/route.ts`) tapi belum terdaftar di `SahamLensApi.kt` — task menambahkannya di sisi Android saja.
- Chart range pakai nilai asli yang didukung backend: `1mo, 3mo, 6mo, 1y, 3y, 5y, 20y` (dari `app/api/stock/[ticker]/route.ts:63`) — BUKAN `1D/1W/1M/YTD/1Y/3Y/5Y` yang disebut mockup, itu tidak didukung backend.
- Semua nama tampilan yang jadi keputusan eksplisit: "AI Council" (bukan AI Copilot), "AI Pick" (bukan Breakout Radar/Sinyal), "Tools" (bukan "Alat") di Profil.
- "Market" (route `market`, `MarketScreen.kt`) TIDAK ada padanan langsung di `Sidebar.tsx` web (yang ada cuma "Market Pulse") — keputusan implementasi: tetap dipertahankan, ditaruh di grup Drawer "Beranda" bersama Home & Market Pulse, supaya tidak ada fitur yang hilang diam-diam dari redesign ini.
- Layar yang SUDAH punya `Scaffold`+`TopAppBar` sendiri (Market, Watchlist, Portfolio, AI Council) dapat tombol hamburger di `navigationIcon` TopAppBar yang sudah ada. Layar yang belum punya (Home, Profil) dapat pemicu drawer ditambahkan langsung (Home: ikon di `GreetingRow`; Profil: `Scaffold`+`TopAppBar` baru). Ini menghindari dua TopAppBar bertumpuk.
- Compare/Screener/Risk Calculator/Market Pulse tetap dibuka lewat `navController.navigate(route)` biasa (push, TopAppBar back-arrow yang sudah ada tetap dipakai) — BUKAN `navigateToTab()` (save/restore state) — karena mereka layar utilitas yang dituju sesekali, bukan tab yang ditukar-tukar terus. Home/Market/Watchlist/Portfolio/AI Council pakai `navigateToTab()` seperti sekarang.
- Di tablet/layar lebar (`PermanentNavigationDrawer`, selalu terbuka), ikon hamburger di tiap layar tetap dirender tapi jadi no-op saat ditekan (drawer permanent tidak bisa ditutup) — simplifikasi yang disengaja, dicatat di sini supaya tidak dianggap bug saat review.

---

## Task 1 (Build 008): Navigation Drawer + rename AI Copilot → AI Council

**Files:**
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamDestination.kt`
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamScaffold.kt`
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamNavHost.kt`
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/home/HomeScreen.kt` (param rename + hamburger icon)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/market/MarketScreen.kt` (hamburger di TopAppBar)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/watchlist/WatchlistScreen.kt` (hamburger di TopAppBar)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/portfolio/PortfolioScreen.kt` (hamburger di TopAppBar)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/profile/ProfileScreen.kt` (Scaffold+TopAppBar baru dengan hamburger; toolsMenu tetap ada, lokasi akses ganda sengaja untuk sekarang, dirapikan label "Tools" di Task 8)
- Rename+Modify: `aicopilot/AiCopilotScreen.kt` → `aicopilot/AiCouncilScreen.kt`
- Rename+Modify: `aicopilot/AiCopilotViewModel.kt` → `aicopilot/AiCouncilViewModel.kt`

**Interfaces:**
- Produces: `SahamDestination` enum dengan field baru `val group: SahamNavGroup?` dan companion `drawerGroups: List<Pair<SahamNavGroup, List<SahamDestination>>>`. Entries: `HOME, MARKET, MARKET_PULSE, AI_COUNCIL, COMPARE, SCREENER, RISK_CALCULATOR, WATCHLIST, PORTFOLIO, PROFILE` (PROFILE punya `group = null`).
- Produces: `SahamNestedRoute` tetap ada (dipakai task-task berikutnya), ditambah placeholder route `stock_detail` sekarang menerima query param `mode` (default `"analysis"`) — lihat Task 6.
- Produces: `AiCouncilScreen(modifier: Modifier = Modifier, onOpenDrawer: () -> Unit = {})` (rename dari `AiCopilotScreen`).
- Consumes (Task berikutnya akan MEMODIFIKASI `SahamDestination.kt` lagi untuk menambah `requiresTickerRoute` field di Task 3 — jangan tambahkan field itu di task ini, YAGNI, belum ada pemakainya).

- [ ] **Step 1: Tulis ulang `SahamDestination.kt` (enum terkelompok + drawer groups)**

```kotlin
package com.sahamlens.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Compare
import androidx.compose.material.icons.filled.FilterAlt
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.Compare
import androidx.compose.material.icons.outlined.FilterAlt
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Person
import androidx.compose.ui.graphics.vector.ImageVector

/** Build 008 - Drawer kiri menggantikan Bottom Nav (Build 002), dikelompokkan persis
 * NAV_GROUPS di components/Sidebar.tsx web. PROFILE sengaja group = null - bukan
 * anggota grup manapun, dijangkau lewat ikon terpisah, bukan baris drawer biasa. */
enum class SahamDestination(
    val route: String,
    val label: String,
    val outlinedIcon: ImageVector,
    val filledIcon: ImageVector,
    val group: SahamNavGroup?,
) {
    HOME("home", "Home", Icons.Outlined.Home, Icons.Filled.Home, SahamNavGroup.BERANDA),
    MARKET(
        route = "market",
        label = "Market",
        outlinedIcon = Icons.AutoMirrored.Outlined.TrendingUp,
        filledIcon = Icons.AutoMirrored.Filled.TrendingUp,
        group = SahamNavGroup.BERANDA,
    ),
    MARKET_PULSE("market_pulse", "Market Pulse", Icons.Outlined.Insights, Icons.Filled.Insights, SahamNavGroup.BERANDA),

    AI_COUNCIL("ai_council", "AI Council", Icons.Outlined.AutoAwesome, Icons.Filled.AutoAwesome, SahamNavGroup.ANALISIS),
    COMPARE("compare", "Compare Tool", Icons.Outlined.Compare, Icons.Filled.Compare, SahamNavGroup.ANALISIS),
    SCREENER("screener", "Stock Screener", Icons.Outlined.FilterAlt, Icons.Filled.FilterAlt, SahamNavGroup.ANALISIS),
    RISK_CALCULATOR("risk_calculator", "Risk Calculator", Icons.Outlined.Calculate, Icons.Filled.Calculate, SahamNavGroup.ANALISIS),

    WATCHLIST("watchlist", "Watchlist", Icons.Outlined.BookmarkBorder, Icons.Filled.Bookmark, SahamNavGroup.PORTOFOLIO),
    PORTFOLIO("portfolio", "Akun Demo", Icons.Outlined.AccountBalanceWallet, Icons.Filled.AccountBalanceWallet, SahamNavGroup.PORTOFOLIO),

    PROFILE("profile", "Profil", Icons.Outlined.Person, Icons.Filled.Person, null),
    ;

    companion object {
        /** Tampil di FAB "Tanya AI" (Build 001) hanya di layar yang relevan. */
        val fabEligibleRoutes = setOf(HOME.route)

        /** Destinasi yang dibuka lewat [navigateToTab] (save/restore state) - tab sejati,
         * beda dari Compare/Screener/RiskCalculator yang tetap push biasa. */
        val tabRootRoutes = setOf(HOME.route, MARKET.route, WATCHLIST.route, PORTFOLIO.route, AI_COUNCIL.route)

        /** Urutan grup di Drawer, dan anggotanya - PROFILE sengaja tidak muncul di sini. */
        val drawerGroups: List<Pair<SahamNavGroup, List<SahamDestination>>>
            get() = SahamNavGroup.entries.map { group -> group to entries.filter { it.group == group } }
    }
}

enum class SahamNavGroup(val label: String) {
    BERANDA("Beranda"),
    ANALISIS("Analisis"),
    SINYAL_AI("Sinyal AI"),
    PORTOFOLIO("Portofolio Saya"),
}

/** Rute bersarang, bukan tujuan Drawer - dijangkau lewat kartu saham, tombol "+", atau FAB kontekstual. */
object SahamNestedRoute {
    const val STOCK_DETAIL = "stock_detail/{ticker}?mode={mode}"
    fun stockDetail(ticker: String, mode: String = "analysis") = "stock_detail/$ticker?mode=$mode"

    const val DESIGN_SYSTEM_SHOWCASE = "design_system_showcase"
}
```

- [ ] **Step 2: Verifikasi compile (belum lengkap, dilanjut step berikutnya)**

Run: `cd sahamlens-android && ./gradlew :app:compileDebugKotlin`
Expected: FAIL — `SahamNavHost.kt`/`SahamScaffold.kt` masih pakai `SahamDestination.AI`/`entries` versi lama. Ini diharapkan, lanjut ke step berikutnya dulu sebelum compile ulang.

- [ ] **Step 3: Rename file AI Copilot → AI Council**

Rename `aicopilot/AiCopilotScreen.kt` → `aicopilot/AiCouncilScreen.kt`, ganti isi:

```kotlin
package com.sahamlens.app.aicopilot

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.theme.SahamLensTheme

/** Build 008 - rename dari AiCopilotScreen. Perilaku TIDAK berubah, cuma nama & label
 * ("AI Copilot" -> "AI Council") supaya konsisten dengan istilah web (lihat catatan di
 * spec: Council AI di web cuma link ke /technical/{ticker}, TAPI di Android ini TETAP
 * layar chat penuh yang sudah ada - hanya nama & lokasi grup Drawer yang disamakan). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiCouncilScreen(modifier: Modifier = Modifier, onOpenDrawer: () -> Unit = {}) {
    val viewModel: AiCouncilViewModel = viewModel(
        factory = AiCouncilViewModel.factory(AppGraph.chatRepository, AppGraph.portfolioRepository, AppGraph.marketRepository),
    )
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()
    var input by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) listState.animateScrollToItem(uiState.messages.size - 1)
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("AI Council") },
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Outlined.Menu, contentDescription = "Buka menu")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.padding(innerPadding).fillMaxSize()) {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                state = listState,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(uiState.messages) { message ->
                    SahamCard(
                        variant = if (message.isUser) SahamCardVariant.Filled else SahamCardVariant.Elevated,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(message.text, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (uiState.isSending) {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp))
                            Text(
                                "AI Council berpikir...",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Tanya AI Council...") },
                )
                IconButton(onClick = {
                    if (input.isNotBlank()) {
                        scope.launch { }
                        viewModel.send(input)
                        input = ""
                    }
                }) {
                    Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = "Kirim")
                }
            }
        }
    }
}
```

**PENTING untuk implementer:** kode di atas adalah rekonstruksi dari struktur asli
`AiCopilotScreen.kt` (Scaffold+TopAppBar+LazyColumn chat+input row, berdasarkan import
yang sudah dibaca) DITAMBAH parameter `onOpenDrawer`. Sebelum menimpa file asli,
**baca dulu isi lengkap `AiCopilotScreen.kt` yang sekarang ada** (belum sempat dibaca
penuh saat plan ini ditulis, cuma 40 baris pertama) — pertahankan SEMUA logika/state
yang sudah ada di sana persis, JANGAN pakai kode di atas mentah-mentah kalau ada
perbedaan struktur. Yang WAJIB berubah cuma: (1) nama file & fungsi jadi
`AiCouncilScreen`, (2) tambah param `onOpenDrawer: () -> Unit = {}` disambungkan ke
`navigationIcon` TopAppBar yang sudah ada, (3) title/teks "AI Copilot" → "AI Council"
kalau ada.

- [ ] **Step 4: Rename `AiCopilotViewModel.kt` → `AiCouncilViewModel.kt`**

Rename file dan class `AiCopilotViewModel` → `AiCouncilViewModel` (cari-ganti nama saja,
field/method/factory signature tetap identik — verifikasi dengan membaca file asli dulu
sebelum rename, sama seperti Step 3).

Run: `cd sahamlens-android && grep -rn "AiCopilot" app/src` — pastikan HABIS, tidak ada sisa referensi lama.
Expected: no output (semua sudah diganti AiCouncil).

- [ ] **Step 5: Tulis ulang `SahamNavHost.kt`**

```kotlin
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sahamlens.app.aicopilot.AiCouncilScreen
import com.sahamlens.app.data.AppGraph
import com.sahamlens.app.home.HomeScreen
import com.sahamlens.app.home.HomeViewModel
import com.sahamlens.app.market.MarketScreen
import com.sahamlens.app.portfolio.PortfolioScreen
import com.sahamlens.app.profile.ProfileScreen
import com.sahamlens.app.stockdetail.StockDetailScreen
import com.sahamlens.app.tools.compare.CompareScreen
import com.sahamlens.app.tools.marketpulse.MarketPulseScreen
import com.sahamlens.app.tools.riskcalculator.RiskCalculatorScreen
import com.sahamlens.app.tools.screener.ScreenerScreen
import com.sahamlens.app.ui.showcase.DesignSystemShowcaseScreen
import com.sahamlens.app.watchlist.WatchlistScreen

private const val FADE_THROUGH_MS = 200

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun SahamNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier,
    homeListState: LazyListState? = null,
    onNavigateToTab: (SahamDestination) -> Unit = { navController.navigate(it.route) },
    onOpenDrawer: () -> Unit = {},
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
                val homeViewModel: HomeViewModel = viewModel(
                    factory = HomeViewModel.factory(
                        AppGraph.authRepository,
                        AppGraph.portfolioRepository,
                        AppGraph.marketRepository,
                        AppGraph.watchlistRepository,
                    ),
                )
                val homeState by homeViewModel.uiState.collectAsState()
                HomeScreen(
                    state = homeState,
                    listState = homeListState ?: rememberLazyListState(),
                    sharedTransitionScope = sharedScope,
                    animatedContentScope = this,
                    onStockClick = { ticker -> navController.navigate(SahamNestedRoute.stockDetail(ticker)) },
                    onSeeAllWatchlist = { onNavigateToTab(SahamDestination.WATCHLIST) },
                    onOpenAiCouncil = { onNavigateToTab(SahamDestination.AI_COUNCIL) },
                    onOpenDrawer = onOpenDrawer,
                )
            }
            composable(SahamDestination.AI_COUNCIL.route) {
                AiCouncilScreen(onOpenDrawer = onOpenDrawer)
            }
            composable(SahamDestination.MARKET.route) {
                MarketScreen(
                    onStockClick = { ticker -> navController.navigate(SahamNestedRoute.stockDetail(ticker)) },
                    onOpenDrawer = onOpenDrawer,
                )
            }
            composable(SahamDestination.PORTFOLIO.route) {
                PortfolioScreen(
                    onStockClick = { ticker -> navController.navigate(SahamNestedRoute.stockDetail(ticker, mode = "demo")) },
                    onOpenDrawer = onOpenDrawer,
                )
            }
            composable(SahamDestination.WATCHLIST.route) {
                WatchlistScreen(
                    onStockClick = { ticker -> navController.navigate(SahamNestedRoute.stockDetail(ticker)) },
                    onOpenDrawer = onOpenDrawer,
                )
            }
            composable(SahamDestination.PROFILE.route) {
                ProfileScreen(
                    onOpenDrawer = onOpenDrawer,
                    onOpenDesignSystemShowcase = { navController.navigate(SahamNestedRoute.DESIGN_SYSTEM_SHOWCASE) },
                    onOpenRiskCalculator = { navController.navigate(SahamDestination.RISK_CALCULATOR.route) },
                    onOpenScreener = { navController.navigate(SahamDestination.SCREENER.route) },
                    onOpenCompare = { navController.navigate(SahamDestination.COMPARE.route) },
                    onOpenMarketPulse = { navController.navigate(SahamDestination.MARKET_PULSE.route) },
                )
            }

            composable(
                route = SahamNestedRoute.STOCK_DETAIL,
                arguments = listOf(
                    navArgument("ticker") { type = NavType.StringType },
                    navArgument("mode") { type = NavType.StringType; defaultValue = "analysis" },
                ),
                enterTransition = { scaleIn(tween(300), initialScale = 0.9f) + fadeIn(tween(300)) },
                exitTransition = { fadeOut(tween(150)) },
                popExitTransition = { scaleOut(tween(200), targetScale = 0.9f) + fadeOut(tween(200)) },
            ) { backStackEntry ->
                val ticker = backStackEntry.arguments?.getString("ticker") ?: "BBCA"
                val mode = backStackEntry.arguments?.getString("mode") ?: "analysis"
                StockDetailScreen(
                    ticker = ticker,
                    mode = mode,
                    sharedTransitionScope = sharedScope,
                    animatedContentScope = this,
                    onBack = { navController.popBackStack() },
                    onRequireLogin = { navController.popBackStack() },
                )
            }

            composable(SahamNestedRoute.DESIGN_SYSTEM_SHOWCASE) {
                DesignSystemShowcaseScreen(onBack = { navController.popBackStack() })
            }
            composable(SahamDestination.RISK_CALCULATOR.route) {
                RiskCalculatorScreen(onBack = { navController.popBackStack() })
            }
            composable(SahamDestination.SCREENER.route) {
                ScreenerScreen(
                    onBack = { navController.popBackStack() },
                    onStockClick = { ticker -> navController.navigate(SahamNestedRoute.stockDetail(ticker)) },
                )
            }
            composable(SahamDestination.COMPARE.route) {
                CompareScreen(
                    onBack = { navController.popBackStack() },
                    onRequireLogin = { navController.popBackStack() },
                )
            }
            composable(SahamDestination.MARKET_PULSE.route) {
                MarketPulseScreen(
                    onBack = { navController.popBackStack() },
                    onRequireLogin = { navController.popBackStack() },
                )
            }
        }
    }
}
```

**Catatan:** `StockDetailScreen` di atas dipanggil dengan parameter baru `mode: String` —
ini BELUM ada di `StockDetailScreen.kt` sekarang (baru ditambahkan Task 6). Compile akan
GAGAL di step ini sampai Task 6 selesai — itu normal untuk task ini, karena kita
menabung 1 error kompilasi yang terdokumentasi (bukan lupa), akan hijau lagi begitu
Task 6 landing dalam urutan plan ini. Tandai TODO ini SUDAH diketahui, jangan hentikan
task ini karena error tersebut — lanjutkan ke Step 6 dst, verifikasi akhir Task 1 pakai
`git stash` sementara pada baris `mode = mode` (ganti sementara jadi tanpa param `mode`
saat compile-check Task 1 saja), lalu `git stash pop` sebelum commit. Cara paling bersih:
di Task 1 ini, panggil `StockDetailScreen(ticker = ticker, ...)` **TANPA** parameter
`mode` dulu (hapus baris `mode = mode,` dari pemanggilan), dan simpan variabel `mode`
tidak terpakai jadi `@Suppress("UNUSED_VARIABLE") val mode = ...` — supaya Task 1 tetap
compile bersih berdiri sendiri, lalu Task 6 yang menyambungkannya.

- [ ] **Step 6: Tulis ulang `SahamScaffold.kt` (Drawer)**

```kotlin
package com.sahamlens.app.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.PermanentDrawerSheet
import androidx.compose.material3.PermanentNavigationDrawer
import androidx.compose.material3.Text
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.compose.material3.rememberDrawerState
import kotlinx.coroutines.launch

/**
 * Build 008 - Navigation Drawer (mirror grouping Sidebar.tsx web) menggantikan Bottom
 * Nav/Rail (Build 002). Compact: ModalNavigationDrawer (geser dari kiri, trigger
 * hamburger per-layar). Expanded (tablet): PermanentNavigationDrawer (selalu terbuka -
 * hamburger di tiap layar jadi no-op di mode ini, simplifikasi yang disengaja).
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
    val homeListState = rememberLazyListState()
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    fun navigateToTab(destination: SahamDestination) {
        navController.navigate(destination.route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
        scope.launch { drawerState.close() }
    }

    fun navigatePush(destination: SahamDestination) {
        navController.navigate(destination.route)
        scope.launch { drawerState.close() }
    }

    fun onDrawerItemClick(destination: SahamDestination) {
        if (destination.route in SahamDestination.tabRootRoutes) navigateToTab(destination) else navigatePush(destination)
    }

    if (isExpanded) {
        PermanentNavigationDrawer(
            modifier = modifier,
            drawerContent = {
                PermanentDrawerSheet {
                    SahamDrawerContent(
                        currentRoute = currentRoute,
                        onItemClick = ::onDrawerItemClick,
                        onProfileClick = { navigateToTab(SahamDestination.PROFILE) },
                    )
                }
            },
        ) {
            SahamNavHost(
                navController = navController,
                modifier = Modifier.fillMaxSize(),
                homeListState = homeListState,
                onNavigateToTab = ::navigateToTab,
                onOpenDrawer = {},
            )
        }
    } else {
        ModalNavigationDrawer(
            drawerState = drawerState,
            drawerContent = {
                ModalDrawerSheet {
                    SahamDrawerContent(
                        currentRoute = currentRoute,
                        onItemClick = ::onDrawerItemClick,
                        onProfileClick = { navigateToTab(SahamDestination.PROFILE) },
                    )
                }
            },
        ) {
            SahamNavHost(
                navController = navController,
                modifier = modifier.fillMaxSize(),
                homeListState = homeListState,
                onNavigateToTab = ::navigateToTab,
                onOpenDrawer = { scope.launch { drawerState.open() } },
            )
        }
    }
}

@Composable
private fun SahamDrawerContent(
    currentRoute: String?,
    onItemClick: (SahamDestination) -> Unit,
    onProfileClick: () -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(vertical = 12.dp)) {
        Text(
            "SahamLens",
            style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
        )
        Spacer(Modifier.height(8.dp))
        SahamDestination.drawerGroups.forEach { (group, items) ->
            if (items.isEmpty()) return@forEach
            Text(
                group.label,
                style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
                color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
            )
            items.forEach { destination ->
                val selected = currentRoute == destination.route
                NavigationDrawerItem(
                    label = { Text(destination.label) },
                    selected = selected,
                    icon = {
                        Icon(
                            imageVector = if (selected) destination.filledIcon else destination.outlinedIcon,
                            contentDescription = null,
                        )
                    },
                    onClick = { onItemClick(destination) },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        HorizontalDivider(Modifier.padding(horizontal = 24.dp))
        Spacer(Modifier.height(8.dp))
        NavigationDrawerItem(
            label = { Text(SahamDestination.PROFILE.label) },
            selected = currentRoute == SahamDestination.PROFILE.route,
            icon = {
                Icon(
                    imageVector = if (currentRoute == SahamDestination.PROFILE.route) SahamDestination.PROFILE.filledIcon else SahamDestination.PROFILE.outlinedIcon,
                    contentDescription = null,
                )
            },
            onClick = onProfileClick,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp).fillMaxWidth(),
        )
    }
}
```

**Catatan:** FAB "Tanya AI Council" yang ada di Build 001/006 (scroll-collapse di Home)
DIHAPUS dari scaffold ini — akses ke AI Council sekarang lewat Drawer grup Analisis atau
`onOpenAiCouncil` dari kartu Home (tetap ada, lihat Step 5). Kalau ingin FAB dipertahankan,
itu perubahan scope tambahan di luar spec yang disetujui — JANGAN ditambahkan diam-diam,
tanya user dulu kalau implementer merasa perlu.

- [ ] **Step 7: Tambah `onOpenDrawer` ke `HomeScreen.kt`, rename `onOpenAiCopilot`→`onOpenAiCouncil`**

Di `HomeScreen.kt`, ubah signature fungsi (baris 58-68 versi sekarang):

```kotlin
@Composable
fun HomeScreen(
    state: HomeUiState,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedContentScope: AnimatedContentScope? = null,
    onStockClick: (String) -> Unit = {},
    onSeeAllWatchlist: () -> Unit = {},
    onOpenAiCouncil: () -> Unit = {},
    onOpenDrawer: () -> Unit = {},
) {
```

Dan di `GreetingRow` (baris 116-129), tambah ikon hamburger di depan, ganti pemanggilan
`AiOpportunityBanner(..., onClick = onOpenAiCopilot)` (baris 80) jadi `onClick = onOpenAiCouncil`:

```kotlin
@Composable
private fun GreetingRow(state: HomeUiState, onOpenDrawer: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onOpenDrawer) {
            Icon(Icons.Outlined.Menu, contentDescription = "Buka menu")
        }
        Column(Modifier.weight(1f)) {
            Text("Halo, ${state.userName.ifBlank { "Investor" }}", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Ringkasan hari ini",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Icon(Icons.Outlined.Notifications, contentDescription = "Notifikasi")
    }
}
```

Tambah import `androidx.compose.material.icons.outlined.Menu` dan `androidx.compose.material3.IconButton`
di bagian atas file. Update pemanggilan `GreetingRow(state)` di `item { GreetingRow(state) }`
jadi `item { GreetingRow(state, onOpenDrawer) }`.

- [ ] **Step 8: Tambah `onOpenDrawer` ke TopAppBar `MarketScreen.kt`, `WatchlistScreen.kt`, `PortfolioScreen.kt`**

Untuk ketiga file ini, tambah parameter `onOpenDrawer: () -> Unit = {}` ke signature fungsi
Screen-nya, dan isi `navigationIcon` di `TopAppBar` yang SUDAH ADA di masing-masing file
(saat ini kosong/tidak diset) dengan:

```kotlin
navigationIcon = {
    IconButton(onClick = onOpenDrawer) {
        Icon(Icons.Outlined.Menu, contentDescription = "Buka menu")
    }
},
```

Tambah import `androidx.compose.material.icons.outlined.Menu` di tiap file yang belum punya.
`WatchlistScreen.kt` TopAppBar-nya sudah punya `actions` (tombol refresh) — tambahkan
`navigationIcon` di samping `actions` yang sudah ada, JANGAN hapus tombol refresh.

- [ ] **Step 9: Tambah Scaffold+TopAppBar baru ke `ProfileScreen.kt`**

`ProfileScreen.kt` sekarang TIDAK punya Scaffold sendiri (langsung `LazyColumn`). Bungkus
jadi:

```kotlin
@Composable
fun ProfileScreen(
    modifier: Modifier = Modifier,
    onOpenDrawer: () -> Unit = {},
    onOpenDesignSystemShowcase: () -> Unit = {},
    onOpenRiskCalculator: () -> Unit = {},
    onOpenScreener: () -> Unit = {},
    onOpenCompare: () -> Unit = {},
    onOpenMarketPulse: () -> Unit = {},
) {
    // ... (state & menu list yang sudah ada, TIDAK berubah) ...

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Profil") },
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Outlined.Menu, contentDescription = "Buka menu")
                    }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(modifier = Modifier.padding(innerPadding).fillMaxSize()) {
            // ... isi LazyColumn yang SUDAH ADA sekarang, TIDAK berubah, cuma dipindah
            // ke dalam Scaffold di atas (sebelumnya `LazyColumn(modifier = modifier...)`
            // langsung, sekarang jadi `LazyColumn(modifier = Modifier.padding(innerPadding)...)`) ...
        }
    }
    // ... AlertDialog yang sudah ada di bawah, TIDAK berubah ...
}
```

Tambah import `androidx.compose.material.icons.outlined.Menu`, `androidx.compose.material3.Scaffold`,
`androidx.compose.material3.TopAppBar`, `androidx.compose.material3.IconButton` (kalau belum ada).

- [ ] **Step 10: Compile check penuh**

Run: `cd sahamlens-android && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL (kalau masih gagal karena `mode` param di `StockDetailScreen`,
pastikan Step 5 sudah dilakukan sesuai catatan di step tsb — panggil tanpa `mode` dulu).

- [ ] **Step 11: Verifikasi manual**

Run: `cd sahamlens-android && ./gradlew :app:installDebug` (emulator/device aktif)
Manual: buka app → drawer bisa dibuka lewat ikon hamburger di Home/Market/Watchlist/
Portfolio/AI Council/Profil → semua item drawer (Beranda, Analisis, Sinyal AI kosong
untuk sekarang, Portofolio Saya) berpindah layar dengan benar → Compare/Screener/Risk
Calculator/Market Pulse punya tombol back yang balik ke layar sebelumnya (bukan ke Home)
→ AI Council menampilkan judul "AI Council" bukan "AI Copilot".

- [ ] **Step 12: Commit**

```bash
cd sahamlens-android
git add -A
git commit -m "$(cat <<'EOF'
feat(android): ganti Bottom Nav jadi Navigation Drawer terkelompok, rename AI Copilot -> AI Council

Build 008. Drawer mirror grouping Sidebar.tsx web (Beranda/Analisis/
Sinyal AI/Portofolio Saya). Market dipertahankan (tidak ada di web,
ditaruh di grup Beranda). Compare/Screener/RiskCalculator/MarketPulse
pindah dari nested-only jadi anggota SahamDestination tapi tetap push
navigation (bukan tab-swap).
EOF
)"
```

---

## Task 2 (Build 009): Search screen terpusat

**Files:**
- Create: `sahamlens-android/app/src/main/java/com/sahamlens/app/search/TrendingTickers.kt`
- Create: `sahamlens-android/app/src/main/java/com/sahamlens/app/search/SearchScreen.kt`
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamDestination.kt` (tambah `SahamNestedRoute.SEARCH`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamNavHost.kt` (registrasi route Search)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/watchlist/WatchlistScreen.kt` (tombol "+")

**Interfaces:**
- Consumes: `SahamNestedRoute` dari Task 1.
- Produces: `SahamNestedRoute.SEARCH` = `"search?returnTo={returnTo}"`, `fun search(returnTo: String = "stock_detail"): String`.
- Produces: `SearchScreen(query: String, onQueryChange: (String) -> Unit, results: List<TrendingTicker>, onResultClick: (String) -> Unit, onBack: () -> Unit)` — stateless (data statis, tidak butuh ViewModel/repository, lihat catatan scoping di bawah).
- Produces: `TrendingTickers.ALL: List<TrendingTicker>` (data class `TrendingTicker(val symbol: String, val name: String)`).

**Catatan scoping:** Tap hasil di Search SELALU membuka `stock_detail/{ticker}` (atau
`technical_analyzer/{ticker}` / `fundamental_analyzer/{ticker}` kalau dibuka lewat
`returnTo` dari Drawer, lihat Task 3 & 4) — BUKAN aksi "tambah ke watchlist". Mockup
menunjukkan "+" di sebelah "Daftar Pantauan", tapi spec yang disetujui cuma menyebut
Search sebagai "titik masuk", dan `WatchlistRepository`'s write-API belum diverifikasi
di sesi perencanaan ini. Kalau nanti dibutuhkan aksi "tambah ke watchlist langsung dari
Search", itu perluasan scope terpisah — TANYA USER dulu, jangan diam-diam ditambahkan.

- [ ] **Step 1: Buat `TrendingTickers.kt` (data statis, mirror `lib/trendingTickers.ts` web persis)**

```kotlin
package com.sahamlens.app.search

/** Mirror TRENDING_SYMBOLS + nama di lib/trendingTickers.ts (web) - data statis sengaja,
 * backend tidak punya endpoint trending/search umum. Nama diverifikasi satu-satu dari
 * lib/tickers.ts web, BUKAN dikarang. */
data class TrendingTicker(val symbol: String, val name: String)

object TrendingTickers {
    val ALL = listOf(
        TrendingTicker("BBCA", "Bank Central Asia Tbk."),
        TrendingTicker("BBRI", "Bank Rakyat Indonesia (Persero) Tbk."),
        TrendingTicker("BMRI", "Bank Mandiri (Persero) Tbk."),
        TrendingTicker("BBNI", "Bank Negara Indonesia (Persero) Tbk."),
        TrendingTicker("TLKM", "Telkom Indonesia (Persero) Tbk."),
        TrendingTicker("ASII", "Astra International Tbk."),
        TrendingTicker("ADRO", "Adaro Energy Indonesia Tbk."),
        TrendingTicker("ANTM", "Aneka Tambang Tbk."),
        TrendingTicker("ICBP", "Indofood CBP Sukses Makmur Tbk."),
        TrendingTicker("UNVR", "Unilever Indonesia Tbk."),
        TrendingTicker("GOTO", "GoTo Gojek Tokopedia Tbk."),
        TrendingTicker("MDKA", "Merdeka Copper Gold Tbk."),
        TrendingTicker("PGAS", "Perusahaan Gas Negara Tbk."),
        TrendingTicker("INDF", "Indofood Sukses Makmur Tbk."),
        TrendingTicker("KLBF", "Kalbe Farma Tbk."),
        TrendingTicker("PTBA", "Bukit Asam Tbk."),
        TrendingTicker("SMGR", "Semen Indonesia (Persero) Tbk."),
        TrendingTicker("INCO", "Vale Indonesia Tbk."),
        TrendingTicker("ITMG", "Indo Tambangraya Megah Tbk."),
        TrendingTicker("AKRA", "AKR Corporindo Tbk."),
        TrendingTicker("UNTR", "United Tractors Tbk."),
        TrendingTicker("CPIN", "Charoen Pokphand Indonesia Tbk."),
        TrendingTicker("EXCL", "XL Axiata Tbk."),
        TrendingTicker("MEDC", "Medco Energi Internasional Tbk."),
        TrendingTicker("BRIS", "Bank Syariah Indonesia Tbk."),
    )

    /** Filter lokal by kode/nama - substring, case-insensitive. Kosongkan query = tampilkan semua (state "Trending"). */
    fun filter(query: String): List<TrendingTicker> {
        if (query.isBlank()) return ALL
        val q = query.trim().uppercase()
        return ALL.filter { it.symbol.contains(q) || it.name.uppercase().contains(q) }
    }
}
```

- [ ] **Step 2: Buat `SearchScreen.kt`**

```kotlin
package com.sahamlens.app.search

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant

/** Build 009 - titik masuk cari ticker bersama, dipakai Home/Watchlist ("+") dan alur
 * Drawer -> Technical/Fundamental Analyzer (Task 3 & 4) via returnTo. Data statis
 * (TrendingTickers) - tidak ada endpoint search/trending umum di backend. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(onResultClick: (String) -> Unit, onBack: () -> Unit, modifier: Modifier = Modifier) {
    var query by remember { mutableStateOf("") }
    val results = remember(query) { TrendingTickers.filter(query) }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        placeholder = { Text("Cari ticker atau nama emiten...") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.padding(innerPadding).fillMaxSize()) {
            Text(
                if (query.isBlank()) "Trending" else "Hasil",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            )
            if (results.isEmpty()) {
                Text(
                    "Tidak ditemukan di daftar trending. Coba kode ticker 4 huruf persis (mis. BBCA).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(20.dp),
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(results, key = { it.symbol }) { ticker ->
                        SahamCard(
                            variant = SahamCardVariant.Outlined,
                            modifier = Modifier.fillMaxWidth().clickable { onResultClick(ticker.symbol) },
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                Column(Modifier.padding(start = 12.dp)) {
                                    Text(ticker.symbol, style = MaterialTheme.typography.bodyMedium)
                                    Text(ticker.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: Tambah `SahamNestedRoute.SEARCH` di `SahamDestination.kt`**

Tambahkan di dalam `object SahamNestedRoute` (dari Task 1):

```kotlin
    const val SEARCH = "search?returnTo={returnTo}"
    fun search(returnTo: String = "stock_detail") = "search?returnTo=$returnTo"
```

- [ ] **Step 4: Registrasi route Search di `SahamNavHost.kt`**

Tambah import `com.sahamlens.app.search.SearchScreen`, `androidx.navigation.NavType` (sudah ada),
lalu tambah composable block (setelah blok `PROFILE`, sebelum blok `STOCK_DETAIL`):

```kotlin
            composable(
                route = SahamNestedRoute.SEARCH,
                arguments = listOf(navArgument("returnTo") { type = NavType.StringType; defaultValue = "stock_detail" }),
            ) { backStackEntry ->
                val returnTo = backStackEntry.arguments?.getString("returnTo") ?: "stock_detail"
                SearchScreen(
                    onBack = { navController.popBackStack() },
                    onResultClick = { ticker ->
                        val destinationRoute = when (returnTo) {
                            "technical_analyzer" -> "technical_analyzer/$ticker"
                            "fundamental_analyzer" -> "fundamental_analyzer/$ticker"
                            else -> SahamNestedRoute.stockDetail(ticker)
                        }
                        navController.navigate(destinationRoute) { popUpTo(SahamNestedRoute.SEARCH) { inclusive = true } }
                    },
                )
            }
```

**Catatan:** cabang `"technical_analyzer"` dan `"fundamental_analyzer"` di atas akan
GAGAL compile sampai Task 3 & 4 mendaftarkan route tsb di `NavHost` — untuk Task 2 ini
saja, HAPUS dua baris `"technical_analyzer" -> ...` dan `"fundamental_analyzer" -> ...`
dari `when`, sisakan cuma `else -> SahamNestedRoute.stockDetail(ticker)` (drawer belum
punya entry ke Technical/Fundamental Analyzer sampai Task 3/4 juga, jadi `returnTo`
selain default belum bisa dipicu dari UI manapun di titik ini — aman dihapus sementara).
Task 3 akan mengembalikan baris `"technical_analyzer"`, Task 4 baris `"fundamental_analyzer"`.

- [ ] **Step 5: Tambah tombol "+" di `WatchlistScreen.kt`**

Di `TopAppBar` yang sudah ada (`actions = { IconButton(onClick = viewModel::refresh) {...} }`),
tambah IconButton baru SEBELUM tombol refresh:

```kotlin
                actions = {
                    IconButton(onClick = onOpenSearch) {
                        Icon(Icons.Outlined.Add, contentDescription = "Cari saham")
                    }
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Outlined.Refresh, contentDescription = "Segarkan")
                    }
                },
```

Tambah parameter `onOpenSearch: () -> Unit = {}` ke signature `WatchlistScreen`, dan
import `androidx.compose.material.icons.outlined.Add`. Di `SahamNavHost.kt`, sambungkan:

```kotlin
                WatchlistScreen(
                    onStockClick = { ticker -> navController.navigate(SahamNestedRoute.stockDetail(ticker)) },
                    onOpenDrawer = onOpenDrawer,
                    onOpenSearch = { navController.navigate(SahamNestedRoute.search()) },
                )
```

- [ ] **Step 6: Compile & verifikasi manual**

Run: `cd sahamlens-android && ./gradlew :app:compileDebugKotlin` → Expected: BUILD SUCCESSFUL.
Manual: `./gradlew :app:installDebug` → tombol "+" di Watchlist buka Search → ketik "bbca"
→ hasil filter muncul → tap → buka Stock Detail BBCA. Kosongkan query → daftar Trending
25 ticker muncul semua.

- [ ] **Step 7: Commit**

```bash
cd sahamlens-android
git add -A
git commit -m "$(cat <<'EOF'
feat(android): tambah layar Search terpusat (trending + filter lokal)

Build 009. Data statis mirror lib/trendingTickers.ts web (tidak ada
endpoint search/trending umum di backend). Dipanggil dari tombol "+"
Watchlist; jadi titik masuk bersama untuk alur Drawer -> Technical/
Fundamental Analyzer di Build 010/011.
EOF
)"
```

---

## Task 3 (Build 010): Technical Analyzer screen mandiri

**Files:**
- Create: `sahamlens-android/app/src/main/java/com/sahamlens/app/technicalanalyzer/TechnicalAnalyzerScreen.kt`
- Create: `sahamlens-android/app/src/main/java/com/sahamlens/app/technicalanalyzer/TechnicalAnalyzerViewModel.kt`
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamDestination.kt` (tambah `TickerEntryDrawerItem`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamScaffold.kt` (drawer render item butuh-ticker)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamNavHost.kt` (registrasi route + kembalikan cabang `"technical_analyzer"` di Search)

**Interfaces:**
- Consumes: `SahamNestedRoute.search()` (Task 2), `com.sahamlens.app.stockdetail.AnalyzerRow` (data class sudah ada di `stockdetail/StockDetailModels.kt` — dipakai ulang, BUKAN diduplikasi), `AppGraph.stockDetailRepository` (sudah ada).
- Produces: `TechnicalAnalyzerScreen(ticker: String, onBack: () -> Unit, onRequireLogin: () -> Unit)`.
- Produces: route nested `"technical_analyzer/{ticker}"`.

- [ ] **Step 1: Tambah `TickerEntryDrawerItem` di `SahamDestination.kt`**

Tambah di akhir file (di luar enum/object yang sudah ada):

```kotlin
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.outlined.ShowChart

/** Item Drawer yang butuh ticker dulu sebelum dibuka (lewat Search, lihat
 * SahamNestedRoute.search()) - beda dari [SahamDestination] karena rutenya
 * berparameter ({ticker}), bukan flat. */
data class TickerEntryDrawerItem(val label: String, val icon: ImageVector, val returnTo: String, val group: SahamNavGroup)

val TICKER_ENTRY_DRAWER_ITEMS = listOf(
    TickerEntryDrawerItem("Technical Analyzer", Icons.Outlined.ShowChart, "technical_analyzer", SahamNavGroup.ANALISIS),
)
```

(Tambahkan import di atas ke blok import yang sudah ada di puncak file, jangan duplikat kalau `ImageVector` sudah ter-import.)

- [ ] **Step 2: Render `TICKER_ENTRY_DRAWER_ITEMS` di `SahamDrawerContent` (`SahamScaffold.kt`)**

Ubah signature `SahamDrawerContent` tambah param `onOpenSearch: (returnTo: String) -> Unit`,
dan di dalam loop `SahamDestination.drawerGroups.forEach { (group, items) -> ... }`, SEBELUM
`items.forEach { destination -> ... }`, sisipkan:

```kotlin
            TICKER_ENTRY_DRAWER_ITEMS.filter { it.group == group }.forEach { item ->
                NavigationDrawerItem(
                    label = { Text(item.label) },
                    selected = false,
                    icon = { Icon(item.icon, contentDescription = null) },
                    onClick = { onOpenSearch(item.returnTo) },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                )
            }
```

Update kedua pemanggilan `SahamDrawerContent(...)` di `SahamAppScaffold` (blok `isExpanded`
dan blok `else`) tambah argumen:

```kotlin
                        onOpenSearch = { returnTo ->
                            navController.navigate(SahamNestedRoute.search(returnTo))
                            scope.launch { drawerState.close() }
                        },
```

(Untuk blok `PermanentNavigationDrawer`/`isExpanded`, tidak ada `drawerState` untuk
di-close — cukup `onOpenSearch = { returnTo -> navController.navigate(SahamNestedRoute.search(returnTo)) }`.)

- [ ] **Step 3: Kembalikan cabang `"technical_analyzer"` di `SahamNavHost.kt` (Search `onResultClick`)**

Di blok `composable(route = SahamNestedRoute.SEARCH, ...)` yang dibuat Task 2, ubah `when` jadi:

```kotlin
                        val destinationRoute = when (returnTo) {
                            "technical_analyzer" -> "technical_analyzer/$ticker"
                            else -> SahamNestedRoute.stockDetail(ticker)
                        }
```

- [ ] **Step 4: Registrasi route `technical_analyzer/{ticker}` di `SahamNavHost.kt`**

Tambah import `com.sahamlens.app.technicalanalyzer.TechnicalAnalyzerScreen`, lalu tambah
composable block (setelah blok `SEARCH`, sebelum blok `STOCK_DETAIL`):

```kotlin
            composable(
                route = "technical_analyzer/{ticker}",
                arguments = listOf(navArgument("ticker") { type = NavType.StringType }),
            ) { backStackEntry ->
                val ticker = backStackEntry.arguments?.getString("ticker") ?: "BBCA"
                TechnicalAnalyzerScreen(
                    ticker = ticker,
                    onBack = { navController.popBackStack() },
                    onRequireLogin = { navController.popBackStack() },
                )
            }
```

- [ ] **Step 5: Buat `TechnicalAnalyzerViewModel.kt`**

```kotlin
package com.sahamlens.app.technicalanalyzer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.stockdetail.StockDetailRepository
import com.sahamlens.app.stockdetail.AnalyzerRow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

data class TechnicalAnalyzerUiState(
    val ticker: String = "",
    val isLoading: Boolean = true,
    /** 401 = belum login, 402 = fitur Pro, lainnya = kegagalan jaringan biasa. */
    val errorCode: Int? = null,
    val price: Double = 0.0,
    val changePct: Double = 0.0,
    val consensus: String = "HOLD",
    val totalScore: Int = 0,
    val rows: List<AnalyzerRow> = emptyList(),
)

/** Technical Analyzer mandiri - mirror /dashboard web ("10 Pure Math Filters"). Sumber
 * data SAMA dengan yang sebelumnya mengisi accordion Technical di StockDetailScreen
 * (GET /api/stock/[ticker], field `analyzers` minus Foreign Flow) - dipindah ke sini
 * supaya bisa ditampilkan lebih lega, BUKAN endpoint baru. */
class TechnicalAnalyzerViewModel(
    private val ticker: String,
    private val stockDetailRepository: StockDetailRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(TechnicalAnalyzerUiState(ticker = ticker))
    val uiState: StateFlow<TechnicalAnalyzerUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorCode = null) }
            stockDetailRepository.getDetail(ticker).fold(
                onSuccess = { response ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            price = response.price,
                            changePct = response.stock?.changePct ?: 0.0,
                            consensus = response.consensus,
                            totalScore = response.scoring?.totalScore ?: 0,
                            rows = response.analyzers
                                .filterNot { row -> row.label.contains("Foreign Flow") }
                                .map { row -> AnalyzerRow(row.label, row.value, row.decision) },
                        )
                    }
                },
                onFailure = { error ->
                    val code = (error as? HttpException)?.code()
                    _uiState.update { it.copy(isLoading = false, errorCode = code ?: -1) }
                },
            )
        }
    }

    companion object {
        fun factory(ticker: String, stockDetailRepository: StockDetailRepository) = viewModelFactory {
            initializer { TechnicalAnalyzerViewModel(ticker, stockDetailRepository) }
        }
    }
}
```

- [ ] **Step 6: Buat `TechnicalAnalyzerScreen.kt`**

```kotlin
package com.sahamlens.app.technicalanalyzer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import com.sahamlens.core.designsystem.component.SahamButton
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.component.ShimmerLineRow

private fun badgeVariantFor(consensus: String) = when {
    consensus.contains("BUY") || consensus.contains("BULLISH") -> SahamBadgeVariant.Success
    consensus.contains("SELL") || consensus.contains("BEARISH") -> SahamBadgeVariant.Danger
    else -> SahamBadgeVariant.Neutral
}

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"

/** Build 010 - mirror /dashboard web ("10 Pure Math Filters"), dipindah keluar dari
 * accordion StockDetailScreen (accordion-nya dihapus di Build 013). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechnicalAnalyzerScreen(ticker: String, onBack: () -> Unit, onRequireLogin: () -> Unit, modifier: Modifier = Modifier) {
    val viewModel: TechnicalAnalyzerViewModel = viewModel(
        factory = TechnicalAnalyzerViewModel.factory(ticker, AppGraph.stockDetailRepository),
    )
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Technical Analyzer · $ticker") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali")
                    }
                },
            )
        },
    ) { innerPadding ->
        when (state.errorCode) {
            401 -> TechnicalAnalyzerErrorState(
                title = "Login untuk melihat Technical Analyzer",
                message = "Analisis 10 filter teknikal butuh akun.",
                actionLabel = "Login",
                onAction = onRequireLogin,
                modifier = Modifier.padding(innerPadding),
            )
            402 -> TechnicalAnalyzerErrorState(
                title = "Fitur Pro",
                message = "Upgrade ke SahamLens Pro untuk Technical Analyzer $ticker.",
                actionLabel = null,
                onAction = {},
                modifier = Modifier.padding(innerPadding),
            )
            else -> TechnicalAnalyzerContent(state, modifier = Modifier.padding(innerPadding))
        }
    }
}

@Composable
private fun TechnicalAnalyzerContent(state: TechnicalAnalyzerUiState, modifier: Modifier = Modifier) {
    if (state.isLoading) {
        Column(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(6) { ShimmerLineRow(modifier = Modifier.fillMaxWidth()) }
        }
        return
    }
    LazyColumn(modifier = modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SahamCard(variant = SahamCardVariant.Filled) {
                Column {
                    Text(rupiah(state.price), style = MaterialTheme.typography.displaySmall)
                    Text(
                        "${if (state.changePct >= 0) "+" else ""}${"%.2f".format(state.changePct)}% hari ini",
                        style = MaterialTheme.typography.labelLarge,
                    )
                    androidx.compose.foundation.layout.Spacer(Modifier.padding(top = 8.dp))
                    SahamBadge("${state.consensus} · Skor ${state.totalScore}", variant = badgeVariantFor(state.consensus))
                }
            }
        }
        items(state.rows) { row ->
            SahamCard(variant = SahamCardVariant.Outlined) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(row.label, style = MaterialTheme.typography.bodyMedium)
                        Text(row.value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    SahamBadge(row.decision, variant = badgeVariantFor(row.decision))
                }
            }
        }
    }
}

@Composable
private fun TechnicalAnalyzerErrorState(title: String, message: String, actionLabel: String?, onAction: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
        Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (actionLabel != null) {
            androidx.compose.foundation.layout.Spacer(Modifier.padding(top = 16.dp))
            SahamButton(actionLabel, onClick = onAction)
        }
    }
}
```

- [ ] **Step 7: Compile & verifikasi manual**

Run: `cd sahamlens-android && ./gradlew :app:compileDebugKotlin` → Expected: BUILD SUCCESSFUL.
Manual: Drawer → grup Analisis → "Technical Analyzer" → buka Search → pilih BBCA → layar
Technical Analyzer BBCA muncul dengan harga + badge konsensus + daftar 9 filter (10 dikurangi
Foreign Flow). Kalau belum login, tampil state "Login untuk melihat Technical Analyzer".

- [ ] **Step 8: Commit**

```bash
cd sahamlens-android
git add -A
git commit -m "$(cat <<'EOF'
feat(android): tambah layar Technical Analyzer mandiri

Build 010. Mirror /dashboard web, sumber data SAMA dengan accordion
Technical StockDetailScreen (api/stock/{ticker}) - dipindah, bukan
endpoint baru. Diakses dari Drawer grup Analisis lewat Search.
EOF
)"
```

---

## Task 4 (Build 011): Fundamental Analyzer screen mandiri

**⚠️ Koreksi terhadap spec:** `docs/superpowers/specs/2026-08-01-android-redesign-design.md`
menyebut Fundamental Analyzer "termasuk tabel Revenue/Operating Profit per tahun
(2021/2022/2023 dst.)" dari mockup. Setelah membaca `app/api/fundamental/[ticker]/route.ts:141-176`
langsung, endpoint ini **TIDAK mengembalikan histori tahunan** — `fundamentals.totalRevenue`
cuma satu angka TTM (trailing twelve months), bukan array per tahun. Tabel 2021/2022/2023
di mockup TIDAK punya data pendukung nyata. Sesuai prinsip project ini ("jujur, bukan
dikarang" — lihat `errors.md`), Task ini **TIDAK membuat tabel tahunan palsu**. Yang
ditampilkan: `fundamentals` (PER, PBV, ROE, ROA, DER, Dividend Yield, Profit Margin —
semua field REAL yang sudah dikembalikan endpoint tapi belum ditangkap DTO Android),
`profile` (sektor/industri), plus 10-analyzer list yang sudah ada. Beri tahu user soal
koreksi ini setelah task selesai — tabel Revenue/Op. Profit per tahun dari mockup TIDAK
diimplementasikan karena datanya tidak ada.

**Files:**
- Create: `sahamlens-android/app/src/main/java/com/sahamlens/app/fundamentalanalyzer/FundamentalAnalyzerScreen.kt`
- Create: `sahamlens-android/app/src/main/java/com/sahamlens/app/fundamentalanalyzer/FundamentalAnalyzerViewModel.kt`
- Modify: `sahamlens-android/core/network/src/main/java/com/sahamlens/core/network/model/StockDetailDto.kt` (perluas `FundamentalResponse`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamDestination.kt` (tambah item Drawer)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamNavHost.kt` (registrasi route + cabang `"fundamental_analyzer"`)

**Interfaces:**
- Consumes: `TICKER_ENTRY_DRAWER_ITEMS` (Task 3, ditambahi entry baru).
- Produces: `FundamentalResponse` diperluas dengan `stock: FundamentalStockDto?`, `profile: FundamentalProfileDto?`, `fundamentals: FundamentalRatiosDto?` (semua field REAL dari response asli, opsional/nullable karena kotlinx.serialization default).
- Produces: `FundamentalAnalyzerScreen(ticker: String, onBack: () -> Unit, onRequireLogin: () -> Unit)`.

- [ ] **Step 1: Perluas `FundamentalResponse` di `StockDetailDto.kt`**

Ganti `data class FundamentalResponse` (baris 61-65 versi sekarang) jadi:

```kotlin
@Serializable
data class FundamentalStockDto(
    val symbol: String = "",
    @SerialName("current_price") val currentPrice: Double = 0.0,
    val name: String = "",
    @SerialName("change_pct") val changePct: Double = 0.0,
)

@Serializable
data class FundamentalProfileDto(
    val sector: String = "N/A",
    val industry: String = "N/A",
)

/** Semua field REAL dari app/api/fundamental/[ticker]/route.ts:160-175 (fundamentals.*) -
 * totalRevenue/ebitda TTM saja, BUKAN histori tahunan (endpoint tidak menyediakannya). */
@Serializable
data class FundamentalRatiosDto(
    val marketCap: Double = 0.0,
    val trailingPE: Double = 0.0,
    val forwardPE: Double = 0.0,
    val priceToBook: Double = 0.0,
    val returnOnEquity: Double = 0.0,
    val returnOnAssets: Double = 0.0,
    val debtToEquity: Double = 0.0,
    val totalRevenue: Double = 0.0,
    val profitMargins: Double = 0.0,
    val dividendYield: Double = 0.0,
)

@Serializable
data class FundamentalResponse(
    val ticker: String = "",
    val analyzers: List<AnalyzerDto> = emptyList(),
    val consensus: String = "NEUTRAL",
    val stock: FundamentalStockDto? = null,
    val profile: FundamentalProfileDto? = null,
    val fundamentals: FundamentalRatiosDto? = null,
)
```

- [ ] **Step 2: Compile check DTO**

Run: `cd sahamlens-android && ./gradlew :core:network:compileDebugKotlin`
Expected: BUILD SUCCESSFUL (perubahan DTO backward-compatible, semua field baru nullable/default).

- [ ] **Step 3: Tambah entry Drawer di `SahamDestination.kt`**

Tambah ke `TICKER_ENTRY_DRAWER_ITEMS` (dari Task 3):

```kotlin
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.outlined.AccountBalance

val TICKER_ENTRY_DRAWER_ITEMS = listOf(
    TickerEntryDrawerItem("Technical Analyzer", Icons.Outlined.ShowChart, "technical_analyzer", SahamNavGroup.ANALISIS),
    TickerEntryDrawerItem("Fundamental Analyzer", Icons.Outlined.AccountBalance, "fundamental_analyzer", SahamNavGroup.ANALISIS),
)
```

- [ ] **Step 4: Kembalikan cabang `"fundamental_analyzer"` di `SahamNavHost.kt` (Search `onResultClick`)**

```kotlin
                        val destinationRoute = when (returnTo) {
                            "technical_analyzer" -> "technical_analyzer/$ticker"
                            "fundamental_analyzer" -> "fundamental_analyzer/$ticker"
                            else -> SahamNestedRoute.stockDetail(ticker)
                        }
```

- [ ] **Step 5: Registrasi route `fundamental_analyzer/{ticker}` di `SahamNavHost.kt`**

Tambah import `com.sahamlens.app.fundamentalanalyzer.FundamentalAnalyzerScreen`, tambah composable:

```kotlin
            composable(
                route = "fundamental_analyzer/{ticker}",
                arguments = listOf(navArgument("ticker") { type = NavType.StringType }),
            ) { backStackEntry ->
                val ticker = backStackEntry.arguments?.getString("ticker") ?: "BBCA"
                FundamentalAnalyzerScreen(
                    ticker = ticker,
                    onBack = { navController.popBackStack() },
                    onRequireLogin = { navController.popBackStack() },
                )
            }
```

- [ ] **Step 6: Buat `FundamentalAnalyzerViewModel.kt`**

```kotlin
package com.sahamlens.app.fundamentalanalyzer

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.stockdetail.StockDetailRepository
import com.sahamlens.app.stockdetail.AnalyzerRow
import com.sahamlens.core.network.model.FundamentalRatiosDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FundamentalAnalyzerUiState(
    val ticker: String = "",
    val isLoading: Boolean = true,
    val loadFailed: Boolean = false,
    val price: Double = 0.0,
    val changePct: Double = 0.0,
    val consensus: String = "NEUTRAL",
    val sector: String = "N/A",
    val industry: String = "N/A",
    val ratios: FundamentalRatiosDto? = null,
    val rows: List<AnalyzerRow> = emptyList(),
)

/** Fundamental Analyzer mandiri - mirror /fundamental web. GET /api/fundamental/[ticker]
 * PUBLIK (tanpa login/Pro) - beda dari Technical Analyzer, tidak ada state 401/402,
 * cuma loadFailed generik untuk kegagalan jaringan. */
class FundamentalAnalyzerViewModel(
    private val ticker: String,
    private val stockDetailRepository: StockDetailRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(FundamentalAnalyzerUiState(ticker = ticker))
    val uiState: StateFlow<FundamentalAnalyzerUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, loadFailed = false) }
            stockDetailRepository.getFundamental(ticker).fold(
                onSuccess = { response ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            price = response.stock?.currentPrice ?: 0.0,
                            changePct = response.stock?.changePct ?: 0.0,
                            consensus = response.consensus,
                            sector = response.profile?.sector ?: "N/A",
                            industry = response.profile?.industry ?: "N/A",
                            ratios = response.fundamentals,
                            rows = response.analyzers.map { row -> AnalyzerRow(row.label, row.value, row.decision) },
                        )
                    }
                },
                onFailure = { _uiState.update { it.copy(isLoading = false, loadFailed = true) } },
            )
        }
    }

    companion object {
        fun factory(ticker: String, stockDetailRepository: StockDetailRepository) = viewModelFactory {
            initializer { FundamentalAnalyzerViewModel(ticker, stockDetailRepository) }
        }
    }
}
```

- [ ] **Step 7: Buat `FundamentalAnalyzerScreen.kt`**

```kotlin
package com.sahamlens.app.fundamentalanalyzer

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import com.sahamlens.core.designsystem.component.SahamButton
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.component.ShimmerLineRow
import com.sahamlens.core.network.model.FundamentalRatiosDto

private fun badgeVariantFor(consensus: String) = when {
    consensus.contains("BULLISH") || consensus.contains("UNDERVALUED") -> SahamBadgeVariant.Success
    consensus.contains("BEARISH") || consensus.contains("OVERVALUED") -> SahamBadgeVariant.Danger
    else -> SahamBadgeVariant.Neutral
}

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"
private fun pct(value: Double) = "${"%.2f".format(value * 100)}%"

/** Build 011 - mirror /fundamental web. Data REAL dari GET /api/fundamental/[ticker]
 * (fundamentals.* + profile.* yang baru ditangkap DTO di Task ini) - TIDAK ada tabel
 * Revenue/Op.Profit per tahun (endpoint tidak menyediakan histori, lihat catatan Task 4). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FundamentalAnalyzerScreen(ticker: String, onBack: () -> Unit, onRequireLogin: () -> Unit, modifier: Modifier = Modifier) {
    val viewModel: FundamentalAnalyzerViewModel = viewModel(
        factory = FundamentalAnalyzerViewModel.factory(ticker, AppGraph.stockDetailRepository),
    )
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Fundamental Analyzer · $ticker") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali")
                    }
                },
            )
        },
    ) { innerPadding ->
        when {
            state.isLoading -> Column(Modifier.padding(innerPadding).fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                repeat(6) { ShimmerLineRow(modifier = Modifier.fillMaxWidth()) }
            }
            state.loadFailed -> Column(
                modifier = Modifier.padding(innerPadding).fillMaxSize().padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                Text("Gagal memuat data fundamental", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
                Spacer(Modifier.height(12.dp))
                SahamButton("Coba Lagi", onClick = viewModel::load)
            }
            else -> FundamentalAnalyzerContent(state, modifier = Modifier.padding(innerPadding))
        }
    }
}

@Composable
private fun FundamentalAnalyzerContent(state: FundamentalAnalyzerUiState, modifier: Modifier = Modifier) {
    LazyColumn(modifier = modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SahamCard(variant = SahamCardVariant.Filled) {
                Column {
                    Text(rupiah(state.price), style = MaterialTheme.typography.displaySmall)
                    Text(
                        "${if (state.changePct >= 0) "+" else ""}${"%.2f".format(state.changePct)}% hari ini",
                        style = MaterialTheme.typography.labelLarge,
                    )
                    Spacer(Modifier.height(8.dp))
                    SahamBadge(state.consensus, variant = badgeVariantFor(state.consensus))
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "${state.sector} · ${state.industry}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        state.ratios?.let { ratios -> item { FundamentalRatiosCard(ratios) } }
        item {
            Text("10 Fundamental Analyzers", style = MaterialTheme.typography.titleSmall)
        }
        items(state.rows) { row ->
            SahamCard(variant = SahamCardVariant.Outlined) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(row.label, style = MaterialTheme.typography.bodyMedium)
                        Text(row.value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    SahamBadge(row.decision, variant = badgeVariantFor(row.decision))
                }
            }
        }
    }
}

@Composable
private fun FundamentalRatiosCard(ratios: FundamentalRatiosDto) {
    SahamCard(variant = SahamCardVariant.Outlined) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            RatioRow("PER (Trailing)", "%.2fx".format(ratios.trailingPE))
            RatioRow("PBV", "%.2fx".format(ratios.priceToBook))
            RatioRow("ROE", pct(ratios.returnOnEquity))
            RatioRow("ROA", pct(ratios.returnOnAssets))
            RatioRow("DER", "%.2fx".format(ratios.debtToEquity))
            RatioRow("Dividend Yield", pct(ratios.dividendYield))
            RatioRow("Profit Margin", pct(ratios.profitMargins))
        }
    }
}

@Composable
private fun RatioRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
```

- [ ] **Step 8: Compile & verifikasi manual**

Run: `cd sahamlens-android && ./gradlew :app:compileDebugKotlin` → Expected: BUILD SUCCESSFUL.
Manual: Drawer → grup Analisis → "Fundamental Analyzer" → Search → pilih BBCA → layar
tampil harga, konsensus, sektor/industri, rasio (PER/PBV/ROE/ROA/DER/Dividend
Yield/Profit Margin), dan 10 analyzer fundamental. TIDAK ada tabel tahunan (sesuai koreksi Task ini).

- [ ] **Step 9: Commit**

```bash
cd sahamlens-android
git add -A
git commit -m "$(cat <<'EOF'
feat(android): tambah layar Fundamental Analyzer mandiri

Build 011. Perluas FundamentalResponse DTO menangkap field real yang
sudah dikembalikan api/fundamental/[ticker] (stock/profile/fundamentals)
tapi belum ditangkap. TIDAK ada tabel Revenue/Op.Profit per tahun dari
mockup - endpoint tidak menyediakan histori tahunan, lihat catatan di
plan (koreksi terhadap spec).
EOF
)"
```

---

## Task 5 (Build 012): AI Pick screen (grup "Sinyal AI")

**Files:**
- Create: `sahamlens-android/core/network/src/main/java/com/sahamlens/core/network/model/BreakoutRadarDto.kt`
- Modify: `sahamlens-android/core/network/src/main/java/com/sahamlens/core/network/SahamLensApi.kt` (tambah `getBreakoutRadar()`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/data/tools/ToolsRepository.kt` (tambah method)
- Create: `sahamlens-android/app/src/main/java/com/sahamlens/app/aipick/AiPickScreen.kt`
- Create: `sahamlens-android/app/src/main/java/com/sahamlens/app/aipick/AiPickViewModel.kt`
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamDestination.kt` (tambah `AI_PICK` ke enum, group `SINYAL_AI`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamNavHost.kt` (registrasi route)

**Interfaces:**
- Consumes: `AppGraph.toolsRepository` (sudah ada).
- Produces: `BreakoutRadarResponse` DTO mirror `app/api/breakout-radar/route.ts` PERSIS (field `data: List<BreakoutEntryDto>`, `crossSignals: CrossSignalsDto`, `lastUpdate: String`).
- Produces: `AiPickScreen(onBack: () -> Unit, onRequireLogin: () -> Unit, onStockClick: (String) -> Unit)`.
- Produces: `SahamDestination.AI_PICK` route `"ai_pick"`, group `SINYAL_AI` — destinasi biasa (BUKAN `TickerEntryDrawerItem`, tidak butuh ticker dulu, beda dari Technical/Fundamental Analyzer).

- [ ] **Step 1: Buat `BreakoutRadarDto.kt`**

```kotlin
package com.sahamlens.core.network.model

import kotlinx.serialization.Serializable

/** Mirror PERSIS BreakoutEntry di modules/recommendation/service/breakout.service.ts:8-16
 * (web) - field & tipe dicocokkan satu-satu, termasuk `rr` yang string (bukan number). */
@Serializable
data class BreakoutEntryDto(
    val symbol: String = "",
    val price: Double = 0.0,
    val change: String = "",
    val reason: String = "",
    val signals: List<String> = emptyList(),
    val score: Int = 0,
    val rr: String = "",
)

/** Mirror CrossEntry (breakout.service.ts:18-22). */
@Serializable
data class CrossEntryDto(
    val symbol: String = "",
    val price: Double = 0.0,
    val change: String = "",
)

@Serializable
data class CrossSignalsDto(
    val golden: List<CrossEntryDto> = emptyList(),
    val dead: List<CrossEntryDto> = emptyList(),
)

/** Mirror PERSIS response GET /api/breakout-radar (app/api/breakout-radar/route.ts:34-38)
 * - butuh login + akun Pro (401/402 sama seperti StockDetail/Compare/MarketPulse). */
@Serializable
data class BreakoutRadarResponse(
    val data: List<BreakoutEntryDto> = emptyList(),
    val crossSignals: CrossSignalsDto = CrossSignalsDto(),
    val lastUpdate: String = "",
)
```

- [ ] **Step 2: Tambah `getBreakoutRadar()` di `SahamLensApi.kt`**

Tambah import `com.sahamlens.core.network.model.BreakoutRadarResponse`, lalu tambah method
(di dekat `getScreener`/`getCompare`/`getMarketPulse`):

```kotlin
    @GET("api/breakout-radar")
    suspend fun getBreakoutRadar(): BreakoutRadarResponse
```

- [ ] **Step 3: Tambah method di `ToolsRepository.kt`**

```kotlin
    suspend fun getBreakoutRadar(): Result<com.sahamlens.core.network.model.BreakoutRadarResponse> =
        runCatching { api.getBreakoutRadar() }
```

- [ ] **Step 4: Tambah `AI_PICK` ke `SahamDestination.kt`**

Tambah entry enum baru (setelah `RISK_CALCULATOR`, sebelum `WATCHLIST`):

```kotlin
import androidx.compose.material.icons.filled.Radar
import androidx.compose.material.icons.outlined.Radar

    AI_PICK("ai_pick", "AI Pick", Icons.Outlined.Radar, Icons.Filled.Radar, SahamNavGroup.SINYAL_AI),
```

**Catatan:** `AI_PICK` TIDAK ditambahkan ke `tabRootRoutes` — dibuka lewat push
navigation biasa (`navigatePush`, punya tombol back), bukan tab-swap, sama seperti
Compare/Screener/RiskCalculator (fitur sesekali-dibuka, bukan tab utama).

- [ ] **Step 5: Registrasi route `ai_pick` di `SahamNavHost.kt`**

Tambah import `com.sahamlens.app.aipick.AiPickScreen`, tambah composable:

```kotlin
            composable(SahamDestination.AI_PICK.route) {
                AiPickScreen(
                    onBack = { navController.popBackStack() },
                    onRequireLogin = { navController.popBackStack() },
                    onStockClick = { ticker -> navController.navigate(SahamNestedRoute.stockDetail(ticker)) },
                )
            }
```

- [ ] **Step 6: Buat `AiPickViewModel.kt`**

```kotlin
package com.sahamlens.app.aipick

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.tools.ToolsRepository
import com.sahamlens.core.network.model.BreakoutEntryDto
import com.sahamlens.core.network.model.CrossEntryDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

data class AiPickUiState(
    val isLoading: Boolean = true,
    /** 401 = belum login, 402 = fitur Pro, lainnya = kegagalan jaringan biasa. */
    val errorCode: Int? = null,
    val breakouts: List<BreakoutEntryDto> = emptyList(),
    val goldenCross: List<CrossEntryDto> = emptyList(),
    val deadCross: List<CrossEntryDto> = emptyList(),
)

/** AI Pick - mirror /breakout-radar web ("Breakout, Rekomendasi & Lainnya"). Sumber data
 * SAMA dengan yang mengisi "Top AI Picks carousel" konsepnya (kategori sinyal AI), tapi
 * lewat endpoint dedicated GET /api/breakout-radar (bukan /api/daily-picks yang dipakai
 * Home), full-list bukan cuma top-3. */
class AiPickViewModel(private val toolsRepository: ToolsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(AiPickUiState())
    val uiState: StateFlow<AiPickUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorCode = null) }
            toolsRepository.getBreakoutRadar().fold(
                onSuccess = { response ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            breakouts = response.data,
                            goldenCross = response.crossSignals.golden,
                            deadCross = response.crossSignals.dead,
                        )
                    }
                },
                onFailure = { error ->
                    val code = (error as? HttpException)?.code()
                    _uiState.update { it.copy(isLoading = false, errorCode = code ?: -1) }
                },
            )
        }
    }

    companion object {
        fun factory(toolsRepository: ToolsRepository) = viewModelFactory {
            initializer { AiPickViewModel(toolsRepository) }
        }
    }
}
```

- [ ] **Step 7: Buat `AiPickScreen.kt`**

```kotlin
package com.sahamlens.app.aipick

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import com.sahamlens.core.designsystem.component.SahamButton
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.component.ShimmerLineRow
import com.sahamlens.core.network.model.BreakoutEntryDto
import com.sahamlens.core.network.model.CrossEntryDto

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"

/** Build 012 - mirror /breakout-radar web, isi grup Drawer "Sinyal AI". Home tetap
 * menampilkan carousel ringkas "Top AI Picks" (dari /api/daily-picks) - AiPick ini versi
 * lengkap kategori breakout/golden-cross/dead-cross dari /api/breakout-radar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiPickScreen(onBack: () -> Unit, onRequireLogin: () -> Unit, onStockClick: (String) -> Unit, modifier: Modifier = Modifier) {
    val viewModel: AiPickViewModel = viewModel(factory = AiPickViewModel.factory(AppGraph.toolsRepository))
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("AI Pick") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali")
                    }
                },
            )
        },
    ) { innerPadding ->
        when (state.errorCode) {
            401 -> AiPickErrorState("Login untuk melihat AI Pick", "Breakout & rekomendasi AI butuh akun.", "Login", onRequireLogin, Modifier.padding(innerPadding))
            402 -> AiPickErrorState("Fitur Pro", "Upgrade ke SahamLens Pro untuk AI Pick.", null, {}, Modifier.padding(innerPadding))
            else -> AiPickContent(state, onStockClick, modifier = Modifier.padding(innerPadding))
        }
    }
}

@Composable
private fun AiPickContent(state: AiPickUiState, onStockClick: (String) -> Unit, modifier: Modifier = Modifier) {
    if (state.isLoading) {
        Column(modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(5) { ShimmerLineRow(modifier = Modifier.fillMaxWidth()) }
        }
        return
    }
    LazyColumn(modifier = modifier.fillMaxSize(), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("Breakout Candidates", style = MaterialTheme.typography.titleSmall) }
        if (state.breakouts.isEmpty()) {
            item { Text("Belum ada kandidat breakout hari ini.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(state.breakouts, key = { "b-${it.symbol}" }) { entry -> BreakoutRow(entry, onStockClick) }

        item { Text("Golden Cross", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp)) }
        if (state.goldenCross.isEmpty()) {
            item { Text("Tidak ada sinyal golden cross hari ini.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(state.goldenCross, key = { "g-${it.symbol}" }) { entry -> CrossRow(entry, isGolden = true, onStockClick) }

        item { Text("Dead Cross", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp)) }
        if (state.deadCross.isEmpty()) {
            item { Text("Tidak ada sinyal dead cross hari ini.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
        items(state.deadCross, key = { "d-${it.symbol}" }) { entry -> CrossRow(entry, isGolden = false, onStockClick) }
    }
}

@Composable
private fun BreakoutRow(entry: BreakoutEntryDto, onStockClick: (String) -> Unit) {
    SahamCard(variant = SahamCardVariant.Outlined, modifier = Modifier.fillMaxWidth().clickable { onStockClick(entry.symbol) }) {
        Column {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(entry.symbol, style = MaterialTheme.typography.bodyMedium)
                SahamBadge("Skor ${entry.score}", variant = SahamBadgeVariant.Success)
            }
            Text("${rupiah(entry.price)} (${entry.change})", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(entry.reason, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
            if (entry.rr.isNotBlank()) {
                Text("R/R: ${entry.rr}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun CrossRow(entry: CrossEntryDto, isGolden: Boolean, onStockClick: (String) -> Unit) {
    SahamCard(variant = SahamCardVariant.Outlined, modifier = Modifier.fillMaxWidth().clickable { onStockClick(entry.symbol) }) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text(entry.symbol, style = MaterialTheme.typography.bodyMedium)
                Text("${rupiah(entry.price)} (${entry.change})", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            SahamBadge(if (isGolden) "Golden Cross" else "Dead Cross", variant = if (isGolden) SahamBadgeVariant.Success else SahamBadgeVariant.Danger)
        }
    }
}

@Composable
private fun AiPickErrorState(title: String, message: String, actionLabel: String?, onAction: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
        Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (actionLabel != null) {
            androidx.compose.foundation.layout.Spacer(Modifier.padding(top = 16.dp))
            SahamButton(actionLabel, onClick = onAction)
        }
    }
}
```

- [ ] **Step 8: Compile & verifikasi manual**

Run: `cd sahamlens-android && ./gradlew :app:compileDebugKotlin` → Expected: BUILD SUCCESSFUL.
Manual: Drawer → grup "Sinyal AI" → "AI Pick" → tampil 3 seksi (Breakout Candidates,
Golden Cross, Dead Cross) → tap salah satu kartu → buka Stock Detail ticker itu.

- [ ] **Step 9: Commit**

```bash
cd sahamlens-android
git add -A
git commit -m "$(cat <<'EOF'
feat(android): tambah layar AI Pick (grup Sinyal AI)

Build 012. Mirror /breakout-radar web via endpoint dedicated
GET /api/breakout-radar (baru terdaftar di SahamLensApi, backend sudah
ada). Beda dari Top AI Picks carousel di Home yang pakai /api/daily-picks.
EOF
)"
```

---

## Task 6 (Build 013): Stock Detail — mode Analisis/Akun Demo, hapus accordion Technical/Fundamental, tambah toggle periode chart

**Files:**
- Modify: `sahamlens-android/core/network/src/main/java/com/sahamlens/core/network/SahamLensApi.kt` (`getStockDetail` tambah `range` query param opsional)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/data/stockdetail/StockDetailRepository.kt` (`getDetail` tambah param `range`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/stockdetail/StockDetailModels.kt` (hapus `technicalRows`/`fundamentalRows`/`fundamentalConsensus`, tambah `range`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/stockdetail/StockDetailViewModel.kt`
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/stockdetail/StockDetailScreen.kt`
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/navigation/SahamNavHost.kt` (sambungkan `mode` param + 2 callback baru)

**Interfaces:**
- Consumes: `"technical_analyzer/{ticker}"`, `"fundamental_analyzer/{ticker}"` route (Task 3 & 4).
- Produces: `StockDetailScreen(ticker: String, mode: String = "analysis", onBack, onRequireLogin, onOpenTechnicalAnalyzer: (String) -> Unit, onOpenFundamentalAnalyzer: (String) -> Unit, sharedTransitionScope, animatedContentScope)`.
- `AnalyzerRow` (dipakai Task 3 & 4) TIDAK dihapus — cuma field yang memakainya di `StockDetailUiState` (`technicalRows`) yang dihapus.

- [ ] **Step 1: Tambah `range` query param di `getStockDetail` (`SahamLensApi.kt`)**

Ganti baris `@GET("api/stock/{ticker}") suspend fun getStockDetail(...)`:

```kotlin
    @GET("api/stock/{ticker}")
    suspend fun getStockDetail(@Path("ticker") ticker: String, @Query("range") range: String? = null): StockDetailResponse
```

- [ ] **Step 2: Tambah param `range` di `StockDetailRepository.getDetail`**

```kotlin
    suspend fun getDetail(ticker: String, range: String? = null): Result<StockDetailResponse> =
        runCatching { api.getStockDetail(ticker, range) }
```

- [ ] **Step 3: Update `StockDetailModels.kt`**

```kotlin
package com.sahamlens.app.stockdetail

import com.sahamlens.core.designsystem.component.Candle

/** Nilai valid untuk [range] - PERSIS ALLOWED_RANGES di app/api/stock/[ticker]/route.ts:63,
 * BUKAN 1D/1W/YTD dari mockup (backend tidak dukung). */
enum class ChartRange(val apiValue: String, val label: String) {
    ONE_MONTH("1mo", "1B"),
    THREE_MONTHS("3mo", "3B"),
    SIX_MONTHS("6mo", "6B"),
    ONE_YEAR("1y", "1T"),
    THREE_YEARS("3y", "3T"),
    FIVE_YEARS("5y", "5T"),
    MAX("20y", "Max"),
}

data class StockDetailUiState(
    val ticker: String = "",
    val isLoading: Boolean = true,
    /** 401 = belum login, 402 = fitur Pro, lainnya = kegagalan jaringan biasa. */
    val errorCode: Int? = null,
    val price: Double = 0.0,
    val changePct: Double = 0.0,
    val consensus: String = "HOLD",
    val totalScore: Int = 0,
    val aiSummary: String = "",
    val candles: List<Candle> = emptyList(),
    val range: ChartRange = ChartRange.MAX,
    val bandarNote: String? = null,
    val dcf: DcfUiState? = null,
    val tradeMessage: String? = null,
)

data class AnalyzerRow(val label: String, val value: String, val decision: String)

data class DcfUiState(
    val fairValue: Double? = null,
    val valuationStatus: String? = null,
    val notApplicableReason: String? = null,
    val executiveSummary: String = "",
)
```

**Catatan:** `technicalRows`, `fundamentalRows`, `fundamentalConsensus` DIHAPUS dari state
ini — sudah pindah jadi tanggung jawab `TechnicalAnalyzerViewModel`/`FundamentalAnalyzerViewModel`
(Task 3 & 4) yang manggil repository yang sama secara independen. `AnalyzerRow` class
TETAP ada (masih dipakai kedua ViewModel itu via import lintas-package).

- [ ] **Step 4: Update `StockDetailViewModel.kt`**

```kotlin
package com.sahamlens.app.stockdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.portfolio.PortfolioRepository
import com.sahamlens.app.data.stockdetail.StockDetailRepository
import com.sahamlens.core.designsystem.component.Candle
import com.sahamlens.core.network.model.DcfResponse
import com.sahamlens.core.network.model.StockDetailResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

/**
 * Detail Saham - GET /api/stock/[ticker] (butuh login + Pro, 402 kalau bukan Pro) untuk
 * harga, skor komposit, dan histori chart (Build 013: + parameter range, lihat
 * [ChartRange]); GET /api/dcf/[ticker] (publik) terpisah untuk valuasi DCF. Technical &
 * Fundamental (accordion lama) DIPINDAH ke TechnicalAnalyzerViewModel/FundamentalAnalyzerViewModel
 * (Build 010/011) - ViewModel ini TIDAK lagi memanggil getFundamental().
 */
class StockDetailViewModel(
    private val ticker: String,
    private val stockDetailRepository: StockDetailRepository,
    private val portfolioRepository: PortfolioRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(StockDetailUiState(ticker = ticker))
    val uiState: StateFlow<StockDetailUiState> = _uiState.asStateFlow()

    init { load(ChartRange.MAX) }

    fun load(range: ChartRange = _uiState.value.range) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorCode = null, range = range) }

            val detailResult = stockDetailRepository.getDetail(ticker, range.apiValue)
            val dcfResult = stockDetailRepository.getDcf(ticker)
            val dcfState = dcfResult.getOrNull()?.let(::mapDcf)

            detailResult.fold(
                onSuccess = { response -> _uiState.value = response.toState(range, dcfState) },
                onFailure = { error ->
                    val code = (error as? HttpException)?.code()
                    _uiState.update {
                        it.copy(isLoading = false, errorCode = code ?: -1, dcf = dcfState, range = range)
                    }
                },
            )
        }
    }

    fun setRange(range: ChartRange) = load(range)

    fun buy(lots: Int) = trade(lots) { symbol, price, lot -> portfolioRepository.buy(symbol, price, lot) }

    fun sell(lots: Int) = trade(lots) { symbol, price, lot -> portfolioRepository.sell(symbol, price, lot) }

    private fun trade(lots: Int, action: suspend (String, Double, Int) -> Result<Unit>) {
        viewModelScope.launch {
            val price = _uiState.value.price
            val result = action(ticker, price, lots)
            _uiState.update {
                it.copy(
                    tradeMessage = if (result.isSuccess) "Transaksi $lots lot berhasil." else "Transaksi gagal. Coba lagi.",
                )
            }
        }
    }

    fun clearTradeMessage() {
        _uiState.update { it.copy(tradeMessage = null) }
    }

    private fun mapDcf(dcf: DcfResponse): DcfUiState = DcfUiState(
        fairValue = dcf.quant?.fairValue,
        valuationStatus = dcf.quant?.valuationStatus,
        notApplicableReason = dcf.notApplicableReason,
        executiveSummary = dcf.analysis?.executiveSummary ?: "",
    )

    private fun StockDetailResponse.toState(range: ChartRange, dcf: DcfUiState?): StockDetailUiState {
        val candles = stock?.history?.takeLast(60)?.map {
            Candle(open = it.open, high = it.high, low = it.low, close = it.close)
        } ?: emptyList()
        val bandar = analyzers.firstOrNull { it.label.contains("Foreign Flow") }
        return StockDetailUiState(
            ticker = ticker,
            isLoading = false,
            price = price,
            changePct = stock?.changePct ?: 0.0,
            consensus = consensus,
            totalScore = scoring?.totalScore ?: 0,
            aiSummary = scoring?.alasan3Poin?.joinToString(" ") ?: "",
            candles = candles,
            range = range,
            bandarNote = bandar?.let { "${it.value} (estimasi, bukan data broker resmi)" },
            dcf = dcf,
        )
    }

    companion object {
        fun factory(ticker: String, stockDetailRepository: StockDetailRepository, portfolioRepository: PortfolioRepository) = viewModelFactory {
            initializer { StockDetailViewModel(ticker, stockDetailRepository, portfolioRepository) }
        }
    }
}
```

- [ ] **Step 5: Update `StockDetailScreen.kt` — signature, hero mode-aware, sheet content**

Ubah signature fungsi utama (ganti seluruh blok baris 84-177 versi sekarang):

```kotlin
@OptIn(ExperimentalMaterial3Api::class, ExperimentalSharedTransitionApi::class)
@Composable
fun StockDetailScreen(
    ticker: String,
    mode: String = "analysis",
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedContentScope: AnimatedContentScope? = null,
    onBack: () -> Unit = {},
    onRequireLogin: () -> Unit = {},
    onOpenTechnicalAnalyzer: (String) -> Unit = {},
    onOpenFundamentalAnalyzer: (String) -> Unit = {},
) {
    val viewModel: StockDetailViewModel = viewModel(
        factory = StockDetailViewModel.factory(ticker, AppGraph.stockDetailRepository, AppGraph.portfolioRepository),
    )
    val state by viewModel.uiState.collectAsState()
    val isDemoMode = mode == "demo"
    var tradeDialog by remember { mutableStateOf<TradeAction?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.tradeMessage) {
        state.tradeMessage?.let { message ->
            snackbarHostState.showSnackbar(message, duration = SnackbarDuration.Short)
            viewModel.clearTradeMessage()
        }
    }

    when (state.errorCode) {
        401 -> {
            StockDetailErrorState(
                icon = Icons.Outlined.Lock,
                title = "Login untuk melihat Detail Saham",
                message = "Analisis teknikal & AI Council butuh akun.",
                actionLabel = "Login",
                onAction = onRequireLogin,
                onBack = onBack,
            )
            return
        }
        402 -> {
            StockDetailErrorState(
                icon = Icons.Outlined.Lock,
                title = "Fitur Pro",
                message = "Upgrade ke SahamLens Pro untuk analisis lengkap $ticker.",
                actionLabel = null,
                onAction = {},
                onBack = onBack,
            )
            return
        }
    }

    val sheetState = androidx.compose.material3.rememberStandardBottomSheetState()
    val scaffoldState = androidx.compose.material3.rememberBottomSheetScaffoldState(bottomSheetState = sheetState)

    BottomSheetScaffold(
        modifier = modifier,
        scaffoldState = scaffoldState,
        sheetPeekHeight = 420.dp,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(ticker) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali")
                    }
                },
            )
        },
        sheetContent = {
            StockDetailSheetContent(
                state = state,
                onRangeChange = viewModel::setRange,
                onOpenTechnicalAnalyzer = { onOpenTechnicalAnalyzer(ticker) },
                onOpenFundamentalAnalyzer = { onOpenFundamentalAnalyzer(ticker) },
            )
        },
    ) { innerPadding ->
        StockDetailHero(
            state = state,
            isDemoMode = isDemoMode,
            modifier = Modifier.padding(innerPadding),
            sharedTransitionScope = sharedTransitionScope,
            animatedContentScope = animatedContentScope,
            onBuy = { tradeDialog = TradeAction.BUY },
            onSell = { tradeDialog = TradeAction.SELL },
        )
    }

    tradeDialog?.let { action ->
        TradeDialog(
            action = action,
            price = state.price,
            onDismiss = { tradeDialog = null },
            onConfirm = { lots ->
                if (action == TradeAction.BUY) viewModel.buy(lots) else viewModel.sell(lots)
                tradeDialog = null
            },
        )
    }
}
```

`TradeDialog` dan `StockDetailErrorState` (baris 179-252 versi sekarang) **TIDAK berubah**,
tetap dipakai persis seperti sekarang.

Ganti `StockDetailHero` (baris 254-297 versi sekarang) — tambah param `isDemoMode`, tombol
Buy/Sell hanya render kalau `isDemoMode == true`:

```kotlin
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun StockDetailHero(
    state: StockDetailUiState,
    isDemoMode: Boolean,
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedContentScope: AnimatedContentScope? = null,
    onBuy: () -> Unit = {},
    onSell: () -> Unit = {},
) {
    val extra = SahamLensTheme.extraColors
    var heroModifier: Modifier = modifier.fillMaxWidth().padding(20.dp)
    if (sharedTransitionScope != null && animatedContentScope != null) {
        with(sharedTransitionScope) {
            heroModifier = heroModifier.sharedBounds(
                sharedContentState = rememberSharedContentState(key = "stock-${state.ticker}"),
                animatedVisibilityScope = animatedContentScope,
            )
        }
    }
    Column(modifier = heroModifier) {
        Text(state.ticker, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        if (state.isLoading) {
            ShimmerBox(modifier = Modifier.width(160.dp).height(40.dp))
        } else {
            Text(rupiah(state.price), style = MaterialTheme.typography.displayLarge)
            Text(
                "${if (state.changePct >= 0) "+" else ""}${"%.2f".format(state.changePct)}% hari ini",
                style = MaterialTheme.typography.labelLarge,
                color = if (state.changePct >= 0) extra.success else MaterialTheme.colorScheme.error,
            )
            Spacer(Modifier.height(10.dp))
            SahamBadge("${state.consensus} · Skor ${state.totalScore}", variant = badgeVariantFor(state.consensus))
        }
        if (isDemoMode) {
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SahamButton("Buy", onClick = onBuy, variant = SahamButtonVariant.FilledSuccess, modifier = Modifier.weight(1f))
                SahamButton("Sell", onClick = onSell, variant = SahamButtonVariant.FilledDanger, modifier = Modifier.weight(1f))
            }
        }
    }
}
```

Ganti `StockDetailSheetContent` (baris 299-409 versi sekarang) — hapus `ExpandableSection`
"Technical" & "Fundamental", ganti dengan 2 kartu link, tambah toggle periode di atas Chart:

```kotlin
@Composable
private fun StockDetailSheetContent(
    state: StockDetailUiState,
    onRangeChange: (ChartRange) -> Unit,
    onOpenTechnicalAnalyzer: () -> Unit,
    onOpenFundamentalAnalyzer: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(4.dp).padding(top = 4.dp))

        Text("AI Summary", style = MaterialTheme.typography.titleSmall)
        SahamCard(variant = SahamCardVariant.Filled) {
            if (state.isLoading) {
                ShimmerBox(modifier = Modifier.fillMaxWidth().height(48.dp))
            } else {
                Text(state.aiSummary.ifBlank { "Belum ada ringkasan AI untuk saham ini." }, style = MaterialTheme.typography.bodyMedium)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            ChartRange.entries.forEach { range ->
                androidx.compose.material3.FilterChip(
                    selected = state.range == range,
                    onClick = { onRangeChange(range) },
                    label = { Text(range.label) },
                )
            }
        }
        SahamCard(variant = SahamCardVariant.Outlined) {
            if (state.isLoading) {
                ShimmerBox(modifier = Modifier.fillMaxWidth().height(220.dp))
            } else if (state.candles.isNotEmpty()) {
                CandlestickChart(candles = state.candles)
            } else {
                Box(modifier = Modifier.fillMaxWidth().height(220.dp), contentAlignment = Alignment.Center) {
                    Text("Data chart tidak tersedia", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        Text("Analisis Lanjutan", style = MaterialTheme.typography.titleSmall)
        AnalyzerLinkCard("Technical Analyzer", "Lihat 10 filter teknikal lengkap", onOpenTechnicalAnalyzer)
        AnalyzerLinkCard("Fundamental Analyzer", "Lihat rasio & 10 analyzer fundamental", onOpenFundamentalAnalyzer)

        ExpandableSection(title = "DCF", initiallyExpanded = false) {
            val dcf = state.dcf
            when {
                dcf == null -> Text("Memuat...", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                dcf.notApplicableReason != null -> Text(dcf.executiveSummary, style = MaterialTheme.typography.bodyMedium)
                else -> Column {
                    dcf.fairValue?.let { Text("Nilai Wajar: ${rupiah(it)}", style = MaterialTheme.typography.titleSmall) }
                    Spacer(Modifier.height(4.dp))
                    Text(dcf.executiveSummary, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        ExpandableSection(title = "Bandar Flow", initiallyExpanded = false) {
            Text(state.bandarNote ?: "Belum ada data.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        ExpandableSection(title = "News", initiallyExpanded = false) {
            Text("Segera hadir - belum ada sumber berita per-saham di client Android.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        ExpandableSection(title = "Discussion", initiallyExpanded = false) {
            Text("Segera hadir - sistem komentar belum ada di backend.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun AnalyzerLinkCard(title: String, subtitle: String, onClick: () -> Unit) {
    SahamCard(variant = SahamCardVariant.Outlined, modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text(title, style = MaterialTheme.typography.bodyMedium)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.AutoMirrored.Outlined.ArrowForward, contentDescription = null)
        }
    }
}
```

Tambah import baru yang dibutuhkan di puncak file: `androidx.compose.foundation.clickable`,
`androidx.compose.material.icons.automirrored.outlined.ArrowForward`, `androidx.compose.material3.FilterChip`.
`ExpandableSection` (baris 411-436 versi sekarang) **TIDAK berubah**.

- [ ] **Step 6: Sambungkan `mode` + 2 callback baru di `SahamNavHost.kt`**

Kembalikan baris `mode = mode,` yang dihapus sementara di Task 1 Step 5, dan tambah 2 callback:

```kotlin
                StockDetailScreen(
                    ticker = ticker,
                    mode = mode,
                    sharedTransitionScope = sharedScope,
                    animatedContentScope = this,
                    onBack = { navController.popBackStack() },
                    onRequireLogin = { navController.popBackStack() },
                    onOpenTechnicalAnalyzer = { t -> navController.navigate("technical_analyzer/$t") },
                    onOpenFundamentalAnalyzer = { t -> navController.navigate("fundamental_analyzer/$t") },
                )
```

- [ ] **Step 7: Compile & verifikasi manual**

Run: `cd sahamlens-android && ./gradlew :app:compileDebugKotlin` → Expected: BUILD SUCCESSFUL.
Manual: buka Stock Detail dari Watchlist/Home (mode analysis) → TIDAK ada tombol Buy/Sell
di hero → buka dari tab "Akun Demo" (mode demo) → tombol Buy/Sell MUNCUL, transaksi tetap
jalan seperti sebelumnya → di sheet, section Technical & Fundamental sudah hilang, ganti
2 kartu link → tap "Technical Analyzer" → buka layar Technical Analyzer ticker yang sama
→ toggle 1B/3B/6B/1T/3T/5T/Max di atas chart mengganti data chart.

- [ ] **Step 8: Commit**

```bash
cd sahamlens-android
git add -A
git commit -m "$(cat <<'EOF'
feat(android): pisah mode Analisis/Akun Demo di Stock Detail, hapus accordion Technical/Fundamental, tambah toggle periode chart

Build 013. Buy/Sell cuma tampil mode=demo (dari tab Akun Demo). Technical
& Fundamental pindah total ke layar mandiri (Build 010/011), diganti 2
kartu link di sheet. Chart range pakai nilai asli backend (1mo-20y).
EOF
)"
```

---

## Task 7 (Build 014): Home — hapus Portfolio Card; avatar warna di Watchlist (Home + tab Watchlist)

**Files:**
- Create: `sahamlens-android/core/designsystem/src/main/java/com/sahamlens/core/designsystem/component/TickerAvatar.kt`
- Modify: `sahamlens-android/core/designsystem/src/main/java/com/sahamlens/core/designsystem/theme/Color.kt` (tambah palet avatar)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/home/HomeScreen.kt` (hapus Portfolio Card, pakai `TickerAvatar`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/home/HomeViewModel.kt` (hapus `loadPortfolio()`, field terkait)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/home/HomeModels.kt` (hapus field portfolio)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/watchlist/WatchlistScreen.kt` (pakai `TickerAvatar`)

**Interfaces:**
- Produces: `TickerAvatar(symbol: String, modifier: Modifier = Modifier)` composable, dan `avatarColorFor(symbol: String): Color` helper — dipakai Home & Watchlist.
- `HomeUiState` field `portfolioValue`/`portfolioChangePct`/`isLoadingPortfolio` DIHAPUS (tidak dipakai lagi di mana pun — cek dulu tidak ada pemakai lain sebelum hapus, `grep -rn "portfolioValue\|isLoadingPortfolio" app/src` harus cuma nunjuk `HomeModels.kt`/`HomeViewModel.kt`/`HomeScreen.kt`).

**Catatan scoping:** `AiOpportunityBanner`'s teks (`aiOpportunityText`) sebelumnya
menggabungkan P/L portofolio + sinyal AI (`"Portofolio Anda naik X%..."`). Karena
Portfolio Card dihapus dari Home (app fokus analisa, sesuai keputusan Anda), bagian
kalimat P/L itu JUGA dihapus dari `buildAiOpportunityText()` — banner cuma berisi sinyal
AI murni (`aiOpportunitySentence(dailyPicks)`), tidak lagi menyebut portofolio.

- [ ] **Step 1: Tambah palet avatar di `Color.kt`**

Tambah di akhir file:

```kotlin
// --- Avatar warna per ticker (Build 014) - 8 warna tetap, dipilih via hash kode ticker,
// TIDAK berubah tema (sama di Light/Dark, konsisten seperti avatar inisial di kebanyakan app). */
val AvatarPalette = listOf(
    Color(0xFF4F94FF), Color(0xFFE3C567), Color(0xFF10B981), Color(0xFFF0615C),
    Color(0xFF8B5CF6), Color(0xFFEC4899), Color(0xFF06B6D4), Color(0xFFF97316),
)
```

- [ ] **Step 2: Buat `TickerAvatar.kt`**

```kotlin
package com.sahamlens.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.theme.AvatarPalette
import kotlin.math.abs

/** Warna deterministik per ticker - hash kode saham, BUKAN random per render (supaya
 * satu ticker selalu dapat warna yang sama di mana pun dia muncul di app). */
fun avatarColorFor(symbol: String): Color {
    val index = abs(symbol.uppercase().hashCode()) % AvatarPalette.size
    return AvatarPalette[index]
}

@Composable
fun TickerAvatar(symbol: String, modifier: Modifier = Modifier, size: androidx.compose.ui.unit.Dp = 36.dp) {
    val color = avatarColorFor(symbol)
    val initials = symbol.take(2).uppercase()
    Box(
        modifier = modifier.size(size).background(color, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials,
            color = Color.White,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
        )
    }
}
```

- [ ] **Step 3: Hapus field portofolio di `HomeModels.kt`**

```kotlin
package com.sahamlens.app.home

/**
 * Bentuk data Home - diisi dari data REAL (GET /api/market-summary, /api/daily-picks,
 * /api/live/^JKSE, plus Watchlist repository yang sudah ada) lewat [HomeViewModel].
 * Build 014: field portofolio DIHAPUS - app ini fokus analisa, bukan portofolio riil
 * (Portfolio Card tetap ada di tab "Akun Demo" terpisah, bukan di Home).
 */
data class HomeUiState(
    val userName: String = "",
    val isLoadingMarket: Boolean = true,
    val isLoadingWatchlist: Boolean = true,
    val ihsgPrice: Double? = null,
    val ihsgChangePct: Double? = null,
    val aiOpportunityText: String? = null,
    val topPicks: List<AiPick> = emptyList(),
    val watchlist: List<WatchlistRow> = emptyList(),
    val newsHeadline: String? = null,
)

data class MarketIndex(val name: String, val changePct: Double)

data class AiPick(val ticker: String, val consensus: String, val confidencePct: Int)

data class WatchlistRow(val ticker: String, val price: Double, val changePct: Double)
```

- [ ] **Step 4: Hapus `loadPortfolio()` di `HomeViewModel.kt`**

Hapus import `PortfolioRepository`, parameter `portfolioRepository` dari constructor &
`factory()`, method `loadPortfolio()`, dan pemanggilannya di `init {}`. Sederhanakan
`buildAiOpportunityText()` (hapus bagian `pnlPart`):

```kotlin
package com.sahamlens.app.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.aicopilot.aiOpportunitySentence
import com.sahamlens.app.data.auth.AuthRepository
import com.sahamlens.app.data.market.MarketRepository
import com.sahamlens.app.data.watchlist.WatchlistRepository
import com.sahamlens.core.network.model.DailyPicksResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Home - menggabungkan Market (IHSG + "Hari Ini AI Menemukan") dan Watchlist (cache-first)
 * jadi satu ringkasan yang bisa dibaca habis dalam 10 detik. Build 014: Portfolio DIHAPUS
 * dari sini (app fokus analisa) - tetap ada di tab "Akun Demo" terpisah.
 */
class HomeViewModel(
    private val authRepository: AuthRepository,
    private val marketRepository: MarketRepository,
    watchlistRepository: WatchlistRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var dailyPicks: DailyPicksResponse? = null

    init {
        _uiState.update { it.copy(userName = authRepository.userEmail.value?.substringBefore("@") ?: "Investor") }

        viewModelScope.launch {
            watchlistRepository.watchlist.collect { items ->
                val top3 = items.take(3)
                val quotes = if (top3.isNotEmpty()) marketRepository.getLiveQuotes(top3.map { it.symbol }) else emptyMap()
                _uiState.update { state ->
                    state.copy(
                        isLoadingWatchlist = false,
                        watchlist = top3.map { row ->
                            val quote = quotes[row.symbol]
                            WatchlistRow(row.symbol, quote?.price ?: 0.0, quote?.changePercent ?: 0.0)
                        },
                    )
                }
            }
        }

        loadMarket()
    }

    private fun loadMarket() {
        viewModelScope.launch {
            val ihsg = marketRepository.getIhsg().getOrNull()
            _uiState.update { it.copy(ihsgPrice = ihsg?.price, ihsgChangePct = ihsg?.changePercent) }

            val summary = marketRepository.getSummary().getOrNull()
            val picks = summary?.topTechnical?.take(3)?.map { row ->
                AiPick(ticker = row.symbol, consensus = "BUY", confidencePct = row.score)
            } ?: emptyList()
            dailyPicks = marketRepository.getDailyPicks().getOrNull()
            _uiState.update { it.copy(isLoadingMarket = false, topPicks = picks) }
            buildAiOpportunityText()
        }
    }

    /** Build 014: cuma sinyal AI (dailyPicks), TIDAK lagi menyebut P/L portofolio. */
    private fun buildAiOpportunityText() {
        _uiState.update { state ->
            if (state.isLoadingMarket) return@update state
            state.copy(aiOpportunityText = aiOpportunitySentence(dailyPicks))
        }
    }

    companion object {
        fun factory(
            authRepository: AuthRepository,
            marketRepository: MarketRepository,
            watchlistRepository: WatchlistRepository,
        ) = viewModelFactory {
            initializer { HomeViewModel(authRepository, marketRepository, watchlistRepository) }
        }
    }
}
```

- [ ] **Step 5: Update `HomeScreen.kt` — hapus `PortfolioSummaryCard`/`LoadingCard`, pakai `TickerAvatar`**

Di fungsi `HomeScreen` (`LazyColumn` isi), hapus blok:

```kotlin
        item {
            if (state.isLoadingPortfolio) LoadingCard() else PortfolioSummaryCard(state.portfolioValue, state.portfolioChangePct)
        }
```

Hapus function `LoadingCard()` dan `PortfolioSummaryCard()` sepenuhnya (sudah tidak dipanggil).

Ubah `WatchlistCompact` (baris 268-315 versi sekarang) — tambah `TickerAvatar` di tiap baris:

```kotlin
@Composable
private fun WatchlistCompact(
    rows: List<WatchlistRow>,
    onStockClick: (String) -> Unit,
    onSeeAll: () -> Unit,
) {
    val extra = SahamLensTheme.extraColors
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Watchlist", style = MaterialTheme.typography.titleSmall)
            TextButton(onClick = onSeeAll) {
                Text("Lihat Semua")
                Icon(Icons.AutoMirrored.Outlined.ArrowForward, contentDescription = null, modifier = Modifier.padding(start = 4.dp))
            }
        }
        Spacer(Modifier.height(4.dp))
        if (rows.isEmpty()) {
            Text(
                "Watchlist kosong. Tambahkan saham untuk dipantau di sini.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        rows.take(3).forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth().clickable { onStockClick(row.ticker) }.padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    com.sahamlens.core.designsystem.component.TickerAvatar(row.ticker)
                    Text(row.ticker, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 10.dp))
                }
                Row {
                    Text(rupiah(row.price), style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "${if (row.changePct >= 0) "+" else ""}${"%.1f".format(row.changePct)}%",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (row.changePct >= 0) extra.success else MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
```

Hapus pemanggilan `PortfolioSummaryCard`/`LoadingCard` juga membuat import terkait
tidak terpakai — jalankan compile (Step 7) untuk ketahuan import mana yang perlu dihapus.

- [ ] **Step 6: Update `WatchlistRowCard` di `WatchlistScreen.kt` — pakai `TickerAvatar`**

Ganti isi `WatchlistRowCard` (baris 159-175 versi sekarang):

```kotlin
@Composable
private fun WatchlistRowCard(item: WatchlistCacheEntity, onClick: () -> Unit) {
    SahamCard(variant = SahamCardVariant.Outlined, modifier = Modifier.clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                com.sahamlens.core.designsystem.component.TickerAvatar(item.symbol)
                Text(item.symbol, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 10.dp))
            }
            Text(
                text = item.buyPrice?.let { "Beli @ Rp ${"%,.0f".format(it).replace(',', '.')}" } ?: "Tanpa harga beli",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
```

- [ ] **Step 7: Compile & verifikasi manual**

Run: `cd sahamlens-android && ./gradlew :app:compileDebugKotlin`. Kalau ada error "unused
import" (warning, bukan error) untuk `PortfolioRepository`/`AppGraph.portfolioRepository`
di pemanggilan `HomeViewModel.factory(...)` di `SahamNavHost.kt`, hapus argumen
`AppGraph.portfolioRepository` dari pemanggilan itu (Task ini juga perlu menyentuh
`SahamNavHost.kt` baris pemanggilan `HomeViewModel.factory` — hapus 1 argumen).
Expected: BUILD SUCCESSFUL.

Manual: Home TIDAK lagi menampilkan kartu "Total Portofolio" → tiap baris Watchlist
(Home & tab Watchlist) punya avatar bulat berwarna dengan inisial 2 huruf ticker,
warna KONSISTEN untuk ticker yang sama di kedua tempat.

- [ ] **Step 8: Commit**

```bash
cd sahamlens-android
git add -A
git commit -m "$(cat <<'EOF'
feat(android): hapus Portfolio Card dari Home, tambah avatar warna di Watchlist

Build 014. Home fokus analisa (Greeting, AI Opportunity, IHSG, Top AI
Picks, Watchlist, News) - Portfolio tetap ada di tab Akun Demo terpisah.
TickerAvatar deterministik (hash ticker, 8 warna tetap) dipakai Home &
tab Watchlist.
EOF
)"
```

---

## Task 8 (Build 015): Theming — pilihan Terang/Gelap/Sistem eksplisit, label "Tools"

**Files:**
- Modify: `sahamlens-android/gradle/libs.versions.toml` (tambah DataStore)
- Modify: `sahamlens-android/core/database/build.gradle.kts` (dependency DataStore)
- Create: `sahamlens-android/core/database/src/main/java/com/sahamlens/core/database/theme/ThemePreferences.kt`
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/data/AppGraph.kt` (tambah `themePreferences`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/MainActivity.kt` (baca preference, sambungkan ke `SahamLensTheme`)
- Modify: `sahamlens-android/app/src/main/java/com/sahamlens/app/profile/ProfileScreen.kt` (toggle tema + label "Tools")

**Interfaces:**
- Produces: `ThemeMode` enum (`LIGHT, DARK, SYSTEM`), `ThemePreferences(context: Context)` dengan `val themeMode: Flow<ThemeMode>` dan `suspend fun setThemeMode(mode: ThemeMode)`.
- Produces: `AppGraph.themePreferences: ThemePreferences`.
- `SahamLensTheme(darkTheme: Boolean = isSystemInDarkTheme())` di `Theme.kt` **TIDAK berubah** — sudah menerima parameter eksplisit sejak awal (lihat spec), tinggal disambungkan.

- [ ] **Step 1: Tambah versi DataStore di `libs.versions.toml`**

Tambah di `[versions]` (setelah `ksp = "2.0.21-1.0.28"`):

```toml
datastorePreferences = "1.1.1"
```

Tambah di `[libraries]` (setelah blok `androidx-room-*`):

```toml
androidx-datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastorePreferences" }
```

- [ ] **Step 2: Tambah dependency di `core/database/build.gradle.kts`**

Tambah 1 baris di blok `dependencies {}` (setelah `ksp(libs.androidx.room.compiler)`):

```kotlin
    implementation(libs.androidx.datastore.preferences)
```

- [ ] **Step 3: Buat `ThemePreferences.kt`**

```kotlin
package com.sahamlens.core.database.theme

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

enum class ThemeMode { LIGHT, DARK, SYSTEM }

private val Context.themeDataStore: DataStore<Preferences> by preferencesDataStore(name = "theme_prefs")
private val THEME_MODE_KEY = stringPreferencesKey("theme_mode")

/** Build 015 - preferensi tema eksplisit user (Terang/Gelap/Ikuti Sistem), default SYSTEM
 * (sama seperti perilaku sebelumnya via isSystemInDarkTheme()). Token warna Light/Dark di
 * Color.kt SUDAH lengkap sejak awal - ini cuma menyimpan PILIHAN user, bukan token baru. */
class ThemePreferences(private val context: Context) {
    val themeMode: Flow<ThemeMode> = context.themeDataStore.data.map { prefs ->
        prefs[THEME_MODE_KEY]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: ThemeMode.SYSTEM
    }

    suspend fun setThemeMode(mode: ThemeMode) {
        context.themeDataStore.edit { it[THEME_MODE_KEY] = mode.name }
    }
}
```

- [ ] **Step 4: Tambah `themePreferences` di `AppGraph.kt`**

Tambah import `com.sahamlens.core.database.theme.ThemePreferences`, tambah property:

```kotlin
    val themePreferences: ThemePreferences by lazy { ThemePreferences(appContext) }
```

- [ ] **Step 5: Compile check modul database**

Run: `cd sahamlens-android && ./gradlew :core:database:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Sambungkan preference ke `MainActivity.kt`**

```kotlin
package com.sahamlens.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.database.theme.ThemeMode
import com.sahamlens.core.designsystem.theme.SahamLensTheme

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val windowSizeClass = calculateWindowSizeClass(this)
            val themeMode by AppGraph.themePreferences.themeMode.collectAsState(initial = ThemeMode.SYSTEM)
            val systemDark = isSystemInDarkTheme()
            val darkTheme = when (themeMode) {
                ThemeMode.LIGHT -> false
                ThemeMode.DARK -> true
                ThemeMode.SYSTEM -> systemDark
            }

            SahamLensTheme(darkTheme = darkTheme) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    SahamLensRoot(windowSizeClass = windowSizeClass)
                }
            }
        }
    }
}
```

**Catatan:** sebelumnya `SahamLensTheme(darkTheme = true)` HARDCODE dark-only (lihat
komentar asli di file: "dark mode adalah tema utama produk... tim produk boleh memaksa
true"). Perubahan ini SENGAJA mengaktifkan pilihan Terang yang sebelumnya cuma
"fallback OS tidak dipromosikan" — sesuai keputusan dual-theme yang disetujui user.

- [ ] **Step 7: Tambah toggle tema + rename label "Tools" di `ProfileScreen.kt`**

Tambah import `com.sahamlens.core.database.theme.ThemeMode`, `androidx.compose.material.icons.outlined.DarkMode`,
`androidx.compose.material3.SingleChoiceSegmentedButtonRow`, `androidx.compose.material3.SegmentedButton`,
`androidx.compose.material3.SegmentedButtonDefaults`, `androidx.compose.runtime.collectAsState` (kalau belum ada), `kotlinx.coroutines.flow.Flow` tidak perlu diimport langsung.

Ganti `"Alat & Analisis"` (baris 106-111 versi sekarang) jadi `"Tools"`:

```kotlin
        item {
            Text(
                "Tools",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            )
        }
```

Tambah item baru "Tampilan" (tema) SEBELUM item `toolsMenu` (setelah header user/badge,
sebelum `HorizontalDivider()` yang mendahului "Tools"):

```kotlin
        item {
            val themeMode by AppGraph.themePreferences.themeMode.collectAsState(initial = ThemeMode.SYSTEM)
            val scope = rememberCoroutineScope()
            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text(
                    "Tampilan",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 8.dp),
                )
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    val options = listOf(ThemeMode.LIGHT to "Terang", ThemeMode.DARK to "Gelap", ThemeMode.SYSTEM to "Sistem")
                    options.forEachIndexed { index, (mode, label) ->
                        SegmentedButton(
                            selected = themeMode == mode,
                            onClick = { scope.launch { AppGraph.themePreferences.setThemeMode(mode) } },
                            shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size),
                        ) { Text(label) }
                    }
                }
            }
        }
        item { HorizontalDivider() }
```

(`scope` di sini adalah `rememberCoroutineScope()` yang SUDAH ADA di puncak fungsi
`ProfileScreen` — reuse variabel yang sama, jangan deklarasi ulang.)

- [ ] **Step 8: Compile & verifikasi manual**

Run: `cd sahamlens-android && ./gradlew :app:compileDebugKotlin` → Expected: BUILD SUCCESSFUL.
Manual: Profil → segmented button "Terang/Gelap/Sistem" → pilih "Terang" → SELURUH app
(bukan cuma Profil) berubah ke palet Light dari `Color.kt` → tutup & buka app lagi →
pilihan tetap "Terang" (persisted DataStore, bukan cuma state sesi). Label section tools
di Profil sekarang "Tools", bukan "Alat & Analisis".

- [ ] **Step 9: Commit**

```bash
cd sahamlens-android
git add -A
git commit -m "$(cat <<'EOF'
feat(android): tema Terang/Gelap/Sistem eksplisit via DataStore, rename label "Tools" di Profil

Build 015 (terakhir dari redesign navigasi & layar analisis). Token
warna Light/Dark sudah ada sejak awal - ini cuma mengaktifkan pilihan
user yang sebelumnya hardcode dark-only. Selesai: seluruh spec
2026-08-01-android-redesign-design.md sudah terimplementasi.
EOF
)"
```

---

## Self-Review

**1. Cakupan spec** — tiap bagian `docs/superpowers/specs/2026-08-01-android-redesign-design.md`
sudah ada task-nya:
- Arsitektur Navigasi (Drawer terkelompok) → Task 1
- Search → Task 2
- Technical Analyzer → Task 3
- Fundamental Analyzer → Task 4 (dengan koreksi: tanpa tabel tahunan, lihat catatan di task)
- AI Pick → Task 5
- Stock Detail mode ganda + hapus accordion + toggle chart → Task 6 (dengan koreksi: range asli backend, bukan 1D/1W/YTD)
- Theming dual light/dark + avatar → Task 7 (avatar) + Task 8 (tema)
- Rename AI Council, label "Tools" → Task 1 & Task 8

**2. Placeholder scan** — tidak ada "TBD"/"implement later" tersisa. Satu catatan eksplisit
di Task 1 Step 3 meminta implementer membaca file asli sebelum overwrite (karena isi
lengkap `AiCopilotScreen.kt` belum sempat dibaca penuh saat plan ditulis) — ini instruksi
verifikasi yang jujur, bukan placeholder kosong.

**3. Konsistensi tipe** — `AnalyzerRow(label, value, decision)` dipakai identik di Task 3,
4, dan sisa `StockDetailScreen` (Task 6). `ChartRange` enum (Task 6) dikonsumsi cuma di
`StockDetailViewModel`/`StockDetailScreen`, tidak bocor ke task lain. `SahamDestination`
di-modifikasi bertahap (Task 1 buat dasar, Task 3/4 tambah `TickerEntryDrawerItem`, Task 5
tambah `AI_PICK`) — tiap modifikasi additive, tidak konflik.

**Dua koreksi terhadap spec yang disetujui, sudah dicatat eksplisit di task masing-masing:**
1. Task 4 — TIDAK ada tabel Revenue/Op.Profit per tahun (endpoint tidak menyediakan histori).
2. Task 6 — Chart range pakai `1mo/3mo/6mo/1y/3y/5y/20y` (dukungan backend asli), bukan
   `1D/1W/1M/YTD/1Y/3Y/5Y` dari mockup.
