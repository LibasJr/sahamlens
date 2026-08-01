package com.sahamlens.app.tools.marketpulse

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.CircularProgressIndicator
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
import com.sahamlens.app.common.AccessRequiredScreen
import com.sahamlens.app.common.accessErrorMessage
import com.sahamlens.app.common.accessErrorTitle
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.theme.SahamLensTheme
import com.sahamlens.core.network.model.BreadthMoverDto
import com.sahamlens.core.network.model.MarketPulseIndexDto
import com.sahamlens.core.network.model.SectorHeatmapDto

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"
private fun pct(value: Double) = "${if (value >= 0) "+" else ""}${"%.2f".format(value)}%"

/** Market Pulse - 4 indeks + heatmap 11 sektor + market breadth (advance/decline), GET
 * /api/market-pulse (butuh login + Pro). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarketPulseScreen(modifier: Modifier = Modifier, onBack: () -> Unit = {}, onRequireLogin: () -> Unit = {}) {
    val viewModel: MarketPulseViewModel = viewModel(factory = MarketPulseViewModel.factory(AppGraph.toolsRepository))
    val state by viewModel.uiState.collectAsState()

    val accessTitle = accessErrorTitle(state.errorCode)
    if (accessTitle != null) {
        AccessRequiredScreen(
            title = accessTitle,
            message = accessErrorMessage(state.errorCode, "Market Pulse"),
            actionLabel = if (state.errorCode == 401) "Login" else null,
            onAction = onRequireLogin,
            onBack = onBack,
            modifier = modifier,
        )
        return
    }

    val extra = SahamLensTheme.extraColors

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Market Pulse") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali") }
                },
                actions = {
                    IconButton(onClick = viewModel::load) { Icon(Icons.Outlined.Refresh, contentDescription = "Segarkan") }
                },
            )
        },
    ) { innerPadding ->
        if (state.isLoading) {
            Row(modifier = Modifier.fillMaxSize().padding(innerPadding), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 40.dp))
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(state.indices) { index -> IndexCard(index, extra.success) }
                }
            }

            state.breadth?.let { breadth ->
                item {
                    Column {
                        Text("Market Breadth", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SahamBadge("${breadth.advancing} naik", variant = SahamBadgeVariant.Success)
                            SahamBadge("${breadth.declining} turun", variant = SahamBadgeVariant.Danger)
                            SahamBadge("${breadth.unchanged} stagnan", variant = SahamBadgeVariant.Neutral)
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Rasio Advance/Decline: ${"%.2f".format(breadth.advanceDeclineRatio)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            item {
                Column {
                    Text("Heatmap Sektor", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(8.dp))
                    state.sectorHeatmap.chunked(2).forEach { rowSectors ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            rowSectors.forEach { sector -> SectorCard(sector, modifier = Modifier.weight(1f)) }
                            if (rowSectors.size < 2) Spacer(Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }

            state.breadth?.let { breadth ->
                item { MoversList("Top Gainer (Breadth Sample)", breadth.topGainers, showChange = true) }
                item { MoversList("Top Loser (Breadth Sample)", breadth.topLosers, showChange = true) }
            }
        }
    }
}

@Composable
private fun IndexCard(index: MarketPulseIndexDto, successColor: androidx.compose.ui.graphics.Color) {
    SahamCard(variant = SahamCardVariant.Elevated, modifier = Modifier.width(150.dp)) {
        Column {
            Text(index.name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("%,.2f".format(index.price).replace(',', '.'), style = MaterialTheme.typography.titleMedium)
            Text(
                pct(index.changePct),
                style = MaterialTheme.typography.labelLarge,
                color = if (index.changePct >= 0) successColor else MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun SectorCard(sector: SectorHeatmapDto, modifier: Modifier = Modifier) {
    val extra = SahamLensTheme.extraColors
    SahamCard(variant = SahamCardVariant.Outlined, modifier = modifier) {
        Column {
            Text(sector.sector, style = MaterialTheme.typography.bodySmall)
            Text(
                pct(sector.changePct),
                style = MaterialTheme.typography.titleSmall,
                color = if (sector.changePct >= 0) extra.success else MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun MoversList(title: String, rows: List<BreadthMoverDto>, showChange: Boolean) {
    val extra = SahamLensTheme.extraColors
    Column {
        Text(title, style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        rows.forEach { row ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(row.symbol, style = MaterialTheme.typography.bodyMedium)
                if (showChange) {
                    Text(
                        "${rupiah(row.price)}  ${pct(row.changePct)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (row.changePct >= 0) extra.success else MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
