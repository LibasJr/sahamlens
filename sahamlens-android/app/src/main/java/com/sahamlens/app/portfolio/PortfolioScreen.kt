package com.sahamlens.app.portfolio

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
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
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.component.ShimmerLineRow
import com.sahamlens.core.designsystem.theme.SahamLensTheme
import androidx.compose.material3.ExperimentalMaterial3Api

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"

/** Portfolio (Akun Demo) - modal & lot dari server, harga terkini per simbol dipanggil paralel
 * (lihat PortfolioViewModel) supaya P/L yang tampil benar-benar nilai posisi terkini. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PortfolioScreen(modifier: Modifier = Modifier, onStockClick: (String) -> Unit = {}) {
    val viewModel: PortfolioViewModel = viewModel(
        factory = PortfolioViewModel.factory(AppGraph.portfolioRepository, AppGraph.marketRepository),
    )
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Portfolio") },
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
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { if (uiState.error != null) ErrorBanner(uiState.error!!, viewModel::refresh) }
            item { PortfolioValueCard(uiState) }
            item { CashCard(uiState.cash) }
            item {
                Text("Holdings", style = MaterialTheme.typography.titleSmall)
            }
            if (uiState.isLoading && uiState.holdings.isEmpty()) {
                item { repeat(3) { ShimmerLineRow(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) } }
            } else if (uiState.holdings.isEmpty()) {
                item { EmptyHoldings() }
            } else {
                items(uiState.holdings) { row -> HoldingCard(row, onClick = { onStockClick(row.symbol) }) }
            }
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
private fun PortfolioValueCard(uiState: PortfolioUiState) {
    val extra = SahamLensTheme.extraColors
    SahamCard(variant = SahamCardVariant.Elevated) {
        Column {
            Text("Total Nilai Portofolio", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(rupiah(uiState.totalValue), style = MaterialTheme.typography.displaySmall)
            if (uiState.totalCost > 0) {
                Text(
                    "${if (uiState.totalPnlPct >= 0) "+" else ""}${"%.2f".format(uiState.totalPnlPct)}% dari modal",
                    style = MaterialTheme.typography.labelLarge,
                    color = if (uiState.totalPnlPct >= 0) extra.success else MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun CashCard(cash: Double) {
    SahamCard(variant = SahamCardVariant.Filled) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.AccountBalanceWallet, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(10.dp))
            Column {
                Text("Cash Tersedia", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(rupiah(cash), style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
private fun EmptyHoldings() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Belum ada posisi terbuka", style = MaterialTheme.typography.titleMedium)
        Text(
            "Mulai paper trading dari Detail Saham.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun HoldingCard(row: HoldingRow, onClick: () -> Unit) {
    val extra = SahamLensTheme.extraColors
    SahamCard(variant = SahamCardVariant.Outlined, modifier = Modifier.clickable(onClick = onClick)) {
        Column {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(row.symbol, style = MaterialTheme.typography.titleSmall)
                Text(
                    "${if (row.pnlPct >= 0) "+" else ""}${"%.2f".format(row.pnlPct)}%",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (row.pnlPct >= 0) extra.success else MaterialTheme.colorScheme.error,
                )
            }
            Spacer(Modifier.height(4.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "${row.lots} lot @ ${rupiah(row.avgPrice)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(rupiah(row.currentValue), style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
