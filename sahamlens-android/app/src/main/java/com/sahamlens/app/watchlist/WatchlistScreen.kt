package com.sahamlens.app.watchlist

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.BookmarkBorder
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
import com.sahamlens.core.database.watchlist.WatchlistCacheEntity
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.component.ShimmerLineRow
import androidx.compose.material3.ExperimentalMaterial3Api

/**
 * Build 007 - contoh nyata cache-first: cache Room tampil seketika (label "Data X menit lalu"),
 * jaringan menyegarkan di latar belakang, error tidak mengosongkan layar (cache lama tetap
 * ditampilkan bersama pesan error + tombol Coba Lagi), bukan skeleton selamanya.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchlistScreen(modifier: Modifier = Modifier, onStockClick: (String) -> Unit = {}) {
    val viewModel: WatchlistViewModel = viewModel(
        factory = WatchlistViewModel.factory(AppGraph.watchlistRepository),
    )
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Watchlist") },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Outlined.Refresh, contentDescription = "Segarkan")
                    }
                },
            )
        },
    ) { innerPadding ->
        WatchlistContent(
            uiState = uiState,
            onRetry = viewModel::refresh,
            onStockClick = onStockClick,
            modifier = Modifier.padding(innerPadding),
        )
    }
}

@Composable
private fun WatchlistContent(
    uiState: WatchlistUiState,
    onRetry: () -> Unit,
    onStockClick: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxSize()) {
        if (uiState.error != null) {
            ErrorBanner(message = uiState.error, onRetry = onRetry)
        }

        when {
            uiState.items.isEmpty() && uiState.isRefreshing -> LoadingSkeleton()
            uiState.items.isEmpty() && uiState.error == null -> EmptyState()
            else -> WatchlistList(uiState, onStockClick)
        }
    }
}

@Composable
private fun LoadingSkeleton() {
    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        repeat(5) { ShimmerLineRow(modifier = Modifier.fillMaxWidth().height(20.dp)) }
    }
}

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Outlined.BookmarkBorder, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Watchlist kosong", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 12.dp))
        Text(
            "Tambahkan saham pertama Anda untuk dipantau di sini.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ErrorBanner(message: String, onRetry: () -> Unit) {
    SahamCard(variant = SahamCardVariant.Filled, modifier = Modifier.fillMaxWidth().padding(20.dp, 12.dp, 20.dp, 0.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            Spacer(Modifier.padding(start = 8.dp))
            Column(Modifier.weight(1f)) {
                Text(message, style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = onRetry) {
                Icon(Icons.Outlined.Refresh, contentDescription = "Coba Lagi")
            }
        }
    }
}

@Composable
private fun WatchlistList(uiState: WatchlistUiState, onStockClick: (String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        uiState.lastSyncedAtEpochMillis?.let { syncedAt ->
            val minutesAgo = ((System.currentTimeMillis() - syncedAt) / 60_000).coerceAtLeast(0)
            Text(
                text = if (minutesAgo <= 0) "Data baru saja diperbarui" else "Data $minutesAgo menit lalu",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(20.dp, 12.dp, 20.dp, 0.dp),
            )
        }
        LazyColumn(
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(uiState.items, key = { it.symbol }) { item ->
                WatchlistRowCard(item, onClick = { onStockClick(item.symbol) })
            }
        }
    }
}

@Composable
private fun WatchlistRowCard(item: WatchlistCacheEntity, onClick: () -> Unit) {
    SahamCard(variant = SahamCardVariant.Outlined, modifier = Modifier.clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(item.symbol, style = MaterialTheme.typography.bodyMedium)
            Text(
                text = item.buyPrice?.let { "Beli @ Rp ${"%,.0f".format(it).replace(',', '.')}" } ?: "Tanpa harga beli",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
