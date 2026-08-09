package com.sahamlens.app.market

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Refresh
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
import com.sahamlens.core.designsystem.component.ShimmerBox
import com.sahamlens.core.designsystem.theme.SahamLensTheme
import com.sahamlens.core.network.model.MarketStockRowDto
import androidx.compose.material3.ExperimentalMaterial3Api

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"

/** Market - indeks IHSG + top gainer/loser/value dari 250 saham likuid IDX (GET
 * /api/market-summary, publik). Sama dengan Watchlist: error tampil sebagai banner di atas
 * data lama, bukan mengosongkan layar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MarketScreen(modifier: Modifier = Modifier, onStockClick: (String) -> Unit = {}) {
    val viewModel: MarketViewModel = viewModel(factory = MarketViewModel.factory(AppGraph.marketRepository))
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Market") },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Outlined.Refresh, contentDescription = "Segarkan")
                    }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            item {
                if (uiState.error != null) ErrorBanner(uiState.error!!, viewModel::refresh)
            }
            item { IhsgCard(uiState) }
            item { SignalSummaryRow(uiState.bullishCount, uiState.bearishCount) }
            item { MoversSection("Top Gainer", uiState.topGainers, isLoading = uiState.isLoading, onStockClick = onStockClick) }
            item { MoversSection("Top Loser", uiState.topLosers, isLoading = uiState.isLoading, onStockClick = onStockClick) }
            item { MoversSection("Nilai Transaksi Tertinggi", uiState.topValue, isLoading = uiState.isLoading, onStockClick = onStockClick) }
        }
    }
}

@Composable
private fun ErrorBanner(message: String, onRetry: () -> Unit) {
    SahamCard(variant = SahamCardVariant.Filled) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            Spacer(Modifier.width(8.dp))
            Text(message, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            IconButton(onClick = onRetry) { Icon(Icons.Outlined.Refresh, contentDescription = "Coba Lagi") }
        }
    }
}

@Composable
private fun IhsgCard(uiState: MarketUiState) {
    val extra = SahamLensTheme.extraColors
    SahamCard(variant = SahamCardVariant.Elevated) {
        Column {
            Text("IHSG", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (uiState.ihsgPrice == null) {
                ShimmerBox(modifier = Modifier.width(140.dp).height(32.dp))
            } else {
                Text("%,.2f".format(uiState.ihsgPrice).replace(',', '.'), style = MaterialTheme.typography.displaySmall)
                val change = uiState.ihsgChangePct ?: 0.0
                Text(
                    "${if (change >= 0) "+" else ""}${"%.2f".format(change)}% hari ini",
                    style = MaterialTheme.typography.labelLarge,
                    color = if (change >= 0) extra.success else MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun SignalSummaryRow(bullish: Int, bearish: Int) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SahamBadge("$bullish saham bullish", variant = SahamBadgeVariant.Success)
        SahamBadge("$bearish saham bearish", variant = SahamBadgeVariant.Danger)
    }
}

@Composable
private fun MoversSection(
    title: String,
    rows: List<MarketStockRowDto>,
    isLoading: Boolean,
    onStockClick: (String) -> Unit,
) {
    val extra = SahamLensTheme.extraColors
    Column {
        Text(title, style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        if (isLoading && rows.isEmpty()) {
            repeat(3) { ShimmerBox(modifier = Modifier.fillMaxWidth().height(20.dp).padding(vertical = 4.dp)) }
            return
        }
        rows.forEach { row ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onStockClick(row.symbol) }
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(row.symbol, style = MaterialTheme.typography.bodyMedium)
                Row {
                    Text(rupiah(row.price), style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.width(8.dp))
                    Text(
                        "${if (row.changePct >= 0) "+" else ""}${"%.2f".format(row.changePct)}%",
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (row.changePct >= 0) extra.success else MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
