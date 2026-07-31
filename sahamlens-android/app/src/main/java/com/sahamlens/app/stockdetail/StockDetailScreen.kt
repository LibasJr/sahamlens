package com.sahamlens.app.stockdetail

import androidx.compose.animation.AnimatedContentScope
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import com.sahamlens.core.designsystem.component.SahamButton
import com.sahamlens.core.designsystem.component.SahamButtonVariant
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.theme.SahamLensTheme

private fun badgeVariantFor(consensus: String) = when {
    consensus.contains("BUY") -> SahamBadgeVariant.Success
    consensus.contains("SELL") -> SahamBadgeVariant.Danger
    else -> SahamBadgeVariant.Neutral
}

/**
 * Build 004 - Detail Saham. Lapis tetap (Hero) di [content], lapis scroll (AI Summary + Chart
 * di posisi peek, section expandable di bawahnya) di [BottomSheetScaffold] sheetContent -
 * supaya tidak menjadi halaman sepanjang 3 km (semua section tertutup default kecuali Chart).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalSharedTransitionApi::class)
@Composable
fun StockDetailScreen(
    state: StockDetailUiState,
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedContentScope: AnimatedContentScope? = null,
    onBack: () -> Unit = {},
) {
    val sheetState = rememberStandardBottomSheetState()
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = sheetState)

    BottomSheetScaffold(
        modifier = modifier,
        scaffoldState = scaffoldState,
        sheetPeekHeight = 420.dp,
        topBar = {
            TopAppBar(
                title = { Text(state.ticker) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali")
                    }
                },
            )
        },
        sheetContent = { StockDetailSheetContent(state) },
    ) { innerPadding ->
        StockDetailHero(
            state = state,
            modifier = Modifier.padding(innerPadding),
            sharedTransitionScope = sharedTransitionScope,
            animatedContentScope = animatedContentScope,
        )
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun StockDetailHero(
    state: StockDetailUiState,
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedContentScope: AnimatedContentScope? = null,
) {
    val extra = SahamLensTheme.extraColors
    var heroModifier: Modifier = modifier
        .fillMaxWidth()
        .padding(20.dp)
    if (sharedTransitionScope != null && animatedContentScope != null) {
        with(sharedTransitionScope) {
            heroModifier = heroModifier.sharedBounds(
                sharedContentState = rememberSharedContentState(key = "stock-${state.ticker}"),
                animatedVisibilityScope = animatedContentScope,
            )
        }
    }
    Column(modifier = heroModifier) {
        Text(state.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("${state.ticker} · ${state.sector}", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Text("Rp ${"%,.0f".format(state.price).replace(',', '.')}", style = MaterialTheme.typography.displayLarge)
        Text(
            "${if (state.changePct >= 0) "+" else ""}${"%.2f".format(state.changePct)}% hari ini",
            style = MaterialTheme.typography.labelLarge,
            color = if (state.changePct >= 0) extra.success else MaterialTheme.colorScheme.error,
        )
        Spacer(Modifier.height(10.dp))
        SahamBadge("${state.consensus} · ${state.confidencePct}%", variant = badgeVariantFor(state.consensus))
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SahamButton("Buy", onClick = {}, variant = SahamButtonVariant.FilledSuccess, modifier = Modifier.weight(1f))
            SahamButton("Sell", onClick = {}, variant = SahamButtonVariant.FilledDanger, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun StockDetailSheetContent(state: StockDetailUiState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .padding(top = 4.dp),
        )

        Text("AI Summary", style = MaterialTheme.typography.titleSmall)
        SahamCard(variant = SahamCardVariant.Filled) {
            Text(state.aiSummary, style = MaterialTheme.typography.bodyMedium)
        }

        Text("Chart", style = MaterialTheme.typography.titleSmall)
        SahamCard(variant = SahamCardVariant.Outlined) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Candlestick chart - diisi data nyata di Build 007",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        ExpandableSection(title = "Technical", body = state.technicalNote, initiallyExpanded = false)
        ExpandableSection(title = "Fundamental", body = state.fundamentalNote, initiallyExpanded = false)
        ExpandableSection(title = "DCF", body = state.dcfNote, initiallyExpanded = false)
        ExpandableSection(title = "Bandar Flow", body = state.bandarNote, initiallyExpanded = false)
        ExpandableSection(title = "News", body = "Segera hadir - belum ada sumber berita nyata di backend.", initiallyExpanded = false)
        ExpandableSection(title = "Discussion", body = "Segera hadir - sistem komentar belum ada di backend.", initiallyExpanded = false)

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun ExpandableSection(title: String, body: String, initiallyExpanded: Boolean) {
    var expanded by remember { mutableStateOf(initiallyExpanded) }
    Column {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { expanded = !expanded },
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            IconButton(onClick = { expanded = !expanded }) {
                Icon(
                    imageVector = if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                    contentDescription = if (expanded) "Tutup $title" else "Buka $title",
                )
            }
        }
        AnimatedVisibility(
            visible = expanded,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically(),
        ) {
            Text(
                body,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 8.dp),
            )
        }
    }
}
