package com.sahamlens.app.tools.screener

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
import androidx.compose.foundation.lazy.LazyRow
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
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.component.SahamFilterChip
import com.sahamlens.core.designsystem.component.ShimmerBox
import com.sahamlens.core.network.model.ScreenerStockDto

private fun rupiah(value: Double?) = value?.let { "Rp ${"%,.0f".format(it).replace(',', '.')}" } ?: "-"

/** Stock Screener - filter multi-faktor per profil risiko (Konservatif/Moderat/Agresif),
 * top 10 saham dari GET /api/screener (publik). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenerScreen(modifier: Modifier = Modifier, onBack: () -> Unit = {}, onStockClick: (String) -> Unit = {}) {
    val viewModel: ScreenerViewModel = viewModel(factory = ScreenerViewModel.factory(AppGraph.toolsRepository))
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Stock Screener") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali") }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    RiskProfile.entries.forEach { profile ->
                        SahamFilterChip(
                            label = profile.apiValue,
                            selected = state.profile == profile,
                            onClick = { viewModel.selectProfile(profile) },
                        )
                    }
                }
            }
            if (state.error != null) {
                item { ErrorBanner(state.error!!) }
            }
            if (state.isLoading) {
                items(4) { ShimmerBox(modifier = Modifier.fillMaxWidth().height(150.dp)) }
            } else {
                items(state.stocks) { stock -> ScreenerStockCard(stock, onClick = { onStockClick(stock.ticker.removeSuffix(".JK")) }) }
            }
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    SahamCard(variant = SahamCardVariant.Filled) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            Spacer(Modifier.width(8.dp))
            Text(message, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ScreenerStockCard(stock: ScreenerStockDto, onClick: () -> Unit) {
    SahamCard(variant = SahamCardVariant.Outlined, modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column {
                    Text(stock.ticker.removeSuffix(".JK"), style = MaterialTheme.typography.titleMedium)
                    Text(stock.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                SahamBadge(stock.sector, variant = SahamBadgeVariant.Neutral)
            }

            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                item { MetricPill("PER (sektor)", (stock.per?.let { "${it}x" } ?: "N/A") + " (${stock.perSector}x)") }
                item { MetricPill("ROE", stock.roe) }
                item { MetricPill("DER", stock.der) }
                item { MetricPill("Div Yield", stock.divYield) }
                item { MetricPill("Growth 5T", stock.revGrowth5yr) }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SahamBadge(stock.bandarmology, variant = SahamBadgeVariant.Neutral)
                SahamBadge(stock.moat, variant = SahamBadgeVariant.Neutral)
            }

            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                LabeledValue("Entry", rupiah(stock.entry))
                LabeledValue("Stop Loss", rupiah(stock.stopLoss))
                LabeledValue("Target Bawah", rupiah(stock.targetBear))
                LabeledValue("Target Atas", rupiah(stock.targetBull))
            }
        }
    }
}

@Composable
private fun MetricPill(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun LabeledValue(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}
