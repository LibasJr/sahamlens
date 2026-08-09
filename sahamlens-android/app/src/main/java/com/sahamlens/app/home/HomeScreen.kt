package com.sahamlens.app.home

import androidx.compose.animation.AnimatedContentScope
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.component.ShimmerBox
import com.sahamlens.core.designsystem.component.ShimmerLineRow
import com.sahamlens.core.designsystem.theme.SahamLensTheme

private fun badgeVariantFor(consensus: String) = when {
    consensus.contains("BUY") -> SahamBadgeVariant.Success
    consensus.contains("SELL") -> SahamBadgeVariant.Danger
    else -> SahamBadgeVariant.Neutral
}

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"

/**
 * Home - terbaca habis dalam 10 detik: sapaan, AI Opportunity (real, dari Portfolio+Market),
 * Portfolio ringkas, IHSG, Top AI Picks (bullish teratas hari ini), Watchlist ringkas (maks 3
 * baris), Berita ("Segera Hadir" - jujur, belum ada sumber berita nyata di client Android).
 * Tiap bagian punya skeleton sendiri sehingga bagian yang sudah siap tidak menunggu yang lain.
 */
@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
fun HomeScreen(
    state: HomeUiState,
    modifier: Modifier = Modifier,
    listState: LazyListState = rememberLazyListState(),
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedContentScope: AnimatedContentScope? = null,
    onStockClick: (String) -> Unit = {},
    onSeeAllWatchlist: () -> Unit = {},
    onOpenAiCopilot: () -> Unit = {},
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        state = listState,
        contentPadding = PaddingValues(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { GreetingRow(state) }
        item {
            if (state.isLoadingPortfolio || state.isLoadingMarket) {
                AiOpportunityLoading()
            } else {
                AiOpportunityBanner(state.aiOpportunityText ?: "Menganalisa pasar...", onClick = onOpenAiCopilot)
            }
        }
        item {
            if (state.isLoadingPortfolio) LoadingCard() else PortfolioSummaryCard(state.portfolioValue, state.portfolioChangePct)
        }
        item {
            if (state.isLoadingMarket) {
                ShimmerBox(modifier = Modifier.width(120.dp).height(28.dp))
            } else if (state.ihsgPrice != null) {
                MarketTodayStrip(state.ihsgPrice, state.ihsgChangePct ?: 0.0)
            }
        }
        item {
            if (state.isLoadingMarket) {
                TopPicksLoading()
            } else {
                TopAiPicksCarousel(
                    picks = state.topPicks,
                    onStockClick = onStockClick,
                    sharedTransitionScope = sharedTransitionScope,
                    animatedContentScope = animatedContentScope,
                )
            }
        }
        item {
            if (state.isLoadingWatchlist) {
                WatchlistLoading()
            } else {
                WatchlistCompact(state.watchlist, onStockClick, onSeeAllWatchlist)
            }
        }
        item { NewsPlaceholderRow() }
    }
}

@Composable
private fun GreetingRow(state: HomeUiState) {
    Row(verticalAlignment = Alignment.CenterVertically) {
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

@Composable
private fun AiOpportunityBanner(text: String, onClick: () -> Unit) {
    SahamCard(variant = SahamCardVariant.Filled, modifier = Modifier.clickable(onClick = onClick)) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(
                imageVector = Icons.Outlined.AutoAwesome,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.tertiary,
            )
            Spacer(Modifier.width(10.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun AiOpportunityLoading() {
    SahamCard(variant = SahamCardVariant.Filled) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.tertiary)
            Spacer(Modifier.width(10.dp))
            ShimmerBox(modifier = Modifier.fillMaxWidth().height(16.dp))
        }
    }
}

@Composable
private fun LoadingCard() {
    SahamCard(variant = SahamCardVariant.Elevated) {
        Column {
            ShimmerBox(modifier = Modifier.width(100.dp).height(12.dp))
            Spacer(Modifier.height(8.dp))
            ShimmerBox(modifier = Modifier.width(180.dp).height(32.dp))
        }
    }
}

@Composable
private fun PortfolioSummaryCard(value: Double?, changePct: Double?) {
    val extra = SahamLensTheme.extraColors
    SahamCard(variant = SahamCardVariant.Elevated) {
        Column {
            Text(
                "Total Portofolio",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                value?.let { rupiah(it) } ?: "Belum ada posisi",
                style = MaterialTheme.typography.displaySmall,
            )
            if (changePct != null && value != null) {
                Text(
                    text = "${if (changePct >= 0) "+" else ""}${"%.2f".format(changePct)}% hari ini",
                    style = MaterialTheme.typography.labelLarge,
                    color = if (changePct >= 0) extra.success else MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun MarketTodayStrip(ihsgPrice: Double, ihsgChangePct: Double) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SahamBadge(
            text = "IHSG ${"%,.0f".format(ihsgPrice).replace(',', '.')} (${if (ihsgChangePct >= 0) "+" else ""}${"%.2f".format(ihsgChangePct)}%)",
            variant = if (ihsgChangePct >= 0) SahamBadgeVariant.Success else SahamBadgeVariant.Danger,
        )
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun TopAiPicksCarousel(
    picks: List<AiPick>,
    onStockClick: (String) -> Unit,
    sharedTransitionScope: SharedTransitionScope?,
    animatedContentScope: AnimatedContentScope?,
) {
    Column {
        Text("Top AI Picks", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        if (picks.isEmpty()) {
            Text(
                "Belum ada sinyal bullish kuat hari ini.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(picks) { pick ->
                var cardModifier: Modifier = Modifier
                    .width(140.dp)
                    .clickable { onStockClick(pick.ticker) }
                if (sharedTransitionScope != null && animatedContentScope != null) {
                    with(sharedTransitionScope) {
                        cardModifier = cardModifier.sharedBounds(
                            sharedContentState = rememberSharedContentState(key = "stock-${pick.ticker}"),
                            animatedVisibilityScope = animatedContentScope,
                        )
                    }
                }
                SahamCard(
                    variant = SahamCardVariant.Outlined,
                    modifier = cardModifier,
                ) {
                    Column {
                        Text(pick.ticker, style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(6.dp))
                        SahamBadge(pick.consensus, variant = badgeVariantFor(pick.consensus))
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Skor ${pick.confidencePct}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TopPicksLoading() {
    Column {
        Text("Top AI Picks", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            repeat(3) { ShimmerBox(modifier = Modifier.width(140.dp).height(88.dp)) }
        }
    }
}

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
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onStockClick(row.ticker) }
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(row.ticker, style = MaterialTheme.typography.bodyMedium)
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

@Composable
private fun WatchlistLoading() {
    Column {
        Text("Watchlist", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        repeat(3) {
            ShimmerLineRow(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
        }
    }
}

@Composable
private fun NewsPlaceholderRow() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = Icons.Outlined.Newspaper,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(10.dp))
        Column {
            Text("Berita & Sentimen Pasar", style = MaterialTheme.typography.bodyMedium)
            Text(
                "Segera hadir",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
