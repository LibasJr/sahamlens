package com.sahamlens.app.tools.compare

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
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
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
import com.sahamlens.core.designsystem.component.SahamButton
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.theme.SahamLensTheme
import com.sahamlens.core.network.model.CompareRowDto

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"

/** Compare Tool - bandingkan 2 saham berdampingan, GET /api/compare (butuh login + Pro). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompareScreen(modifier: Modifier = Modifier, onBack: () -> Unit = {}, onRequireLogin: () -> Unit = {}) {
    val viewModel: CompareViewModel = viewModel(factory = CompareViewModel.factory(AppGraph.toolsRepository))
    val state by viewModel.uiState.collectAsState()

    val accessTitle = accessErrorTitle(state.errorCode)
    if (accessTitle != null) {
        AccessRequiredScreen(
            title = accessTitle,
            message = accessErrorMessage(state.errorCode, "Compare Tool"),
            actionLabel = if (state.errorCode == 401) "Login" else null,
            onAction = onRequireLogin,
            onBack = onBack,
            modifier = modifier,
        )
        return
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Compare Tool") },
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
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = state.symbol1,
                            onValueChange = viewModel::onSymbol1Change,
                            label = { Text("Saham A") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = state.symbol2,
                            onValueChange = viewModel::onSymbol2Change,
                            label = { Text("Saham B") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    SahamButton(
                        text = "Bandingkan",
                        onClick = viewModel::compare,
                        enabled = !state.isLoading,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            if (state.isLoading) {
                item {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        CircularProgressIndicator(modifier = Modifier.padding(20.dp))
                    }
                }
            }

            state.result?.let { result ->
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SahamCard(variant = SahamCardVariant.Filled, modifier = Modifier.weight(1f)) {
                            Column {
                                Text(result.data1.symbol.removeSuffix(".JK"), style = MaterialTheme.typography.titleMedium)
                                Text(rupiah(result.data1.price), style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                        SahamCard(variant = SahamCardVariant.Filled, modifier = Modifier.weight(1f)) {
                            Column {
                                Text(result.data2.symbol.removeSuffix(".JK"), style = MaterialTheme.typography.titleMedium)
                                Text(rupiah(result.data2.price), style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
                items(result.rows) { row -> CompareRowCard(row, result.data1.symbol, result.data2.symbol) }
                item {
                    SahamCard(variant = SahamCardVariant.Outlined) {
                        Column {
                            Text("Kesimpulan", style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(6.dp))
                            Text(result.conclusion, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CompareRowCard(row: CompareRowDto, symbol1: String, symbol2: String) {
    val extra = SahamLensTheme.extraColors
    SahamCard(variant = SahamCardVariant.Outlined) {
        Column {
            Text(row.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                ValueColumn(symbol1.removeSuffix(".JK"), row.a, isWinner = row.winner == symbol1, winnerColor = extra.success)
                ValueColumn(symbol2.removeSuffix(".JK"), row.b, isWinner = row.winner == symbol2, winnerColor = extra.success)
            }
            if (row.reason.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(row.reason, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun ValueColumn(label: String, value: String, isWinner: Boolean, winnerColor: androidx.compose.ui.graphics.Color) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (isWinner) {
                Spacer(Modifier.width(4.dp))
                Text("★", style = MaterialTheme.typography.labelSmall, color = winnerColor)
            }
        }
        Text(
            value,
            style = MaterialTheme.typography.bodyMedium,
            color = if (isWinner) winnerColor else MaterialTheme.colorScheme.onSurface,
        )
    }
}
