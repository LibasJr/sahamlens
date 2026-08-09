package com.sahamlens.app.tools.riskcalculator

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.WarningAmber
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.SahamButton
import com.sahamlens.core.designsystem.component.SahamButtonVariant
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.theme.SahamLensTheme

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"

/** Risk Calculator - murni kalkulator matematika lokal (position sizing + risk/reward),
 * port 1:1 dari app/risk-calculator di web ([calculateRisk]). Satu-satunya panggilan jaringan
 * opsional untuk prefill Harga Entry dari kutipan live. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RiskCalculatorScreen(modifier: Modifier = Modifier, onBack: () -> Unit = {}) {
    val viewModel: RiskCalculatorViewModel = viewModel(factory = RiskCalculatorViewModel.factory(AppGraph.marketRepository))
    val state by viewModel.uiState.collectAsState()

    val modalNum = state.modal.toDoubleOrNull() ?: 0.0
    val riskPctNum = state.riskPct.toDoubleOrNull() ?: 0.0
    val entryNum = state.entry.toDoubleOrNull() ?: 0.0
    val stopLossNum = state.stopLoss.toDoubleOrNull() ?: 0.0
    val targetNum = state.target.toDoubleOrNull() ?: 0.0
    val result = calculateRisk(modalNum, riskPctNum, entryNum, stopLossNum, targetNum)

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Risk Calculator") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali") }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Text(
                    "Hitung ukuran posisi & rasio risk/reward sebelum entry - murni matematika dari input Anda.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            item {
                SahamCard(variant = SahamCardVariant.Elevated) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = state.symbol,
                                onValueChange = viewModel::onSymbolChange,
                                label = { Text("Simbol Saham") },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(Modifier.width(8.dp))
                            SahamButton(
                                text = "Live",
                                onClick = viewModel::fetchLivePrice,
                                variant = SahamButtonVariant.Tonal,
                                enabled = !state.isLoadingPrice,
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = state.modal,
                                onValueChange = viewModel::onModalChange,
                                label = { Text("Modal (Rp)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = state.riskPct,
                                onValueChange = viewModel::onRiskPctChange,
                                label = { Text("Risiko/Trade (%)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedTextField(
                                value = state.entry,
                                onValueChange = viewModel::onEntryChange,
                                label = { Text("Entry") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = state.stopLoss,
                                onValueChange = viewModel::onStopLossChange,
                                label = { Text("Stop Loss") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                            OutlinedTextField(
                                value = state.target,
                                onValueChange = viewModel::onTargetChange,
                                label = { Text("Target") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }

            if (!result.hasValidInput) {
                item {
                    Text(
                        "Isi Modal, Harga Entry, dan Stop Loss (di bawah Entry) untuk melihat hasil perhitungan.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                item { ResultSection(result) }
            }
        }
    }
}

@Composable
private fun ResultSection(result: RiskCalculatorResult) {
    val extra = SahamLensTheme.extraColors
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SahamCard(variant = SahamCardVariant.Filled, modifier = Modifier.weight(1f)) {
                Column {
                    Text("Ukuran Posisi Maks", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${result.finalLot} lot", style = MaterialTheme.typography.titleLarge)
                    Text("${result.finalShares} lembar", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            SahamCard(variant = SahamCardVariant.Filled, modifier = Modifier.weight(1f)) {
                Column {
                    Text("Modal Dibutuhkan", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(rupiah(result.capitalNeeded), style = MaterialTheme.typography.titleMedium)
                }
            }
        }

        if (result.boundByCapital) {
            InfoBanner("Ukuran posisi dibatasi oleh MODAL (bukan budget risiko) - modal Anda tidak cukup untuk mencapai lot maksimal sesuai risk budget.")
        }

        SahamCard(variant = SahamCardVariant.Outlined) {
            Column {
                Text(
                    "JIKA KENA STOP LOSS",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                )
                Text(
                    "-${rupiah(result.maxLossRp)} (${"%.2f".format(result.maxLossPct)}% dari modal)",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }

        result.potentialProfitRp?.let { profit ->
            SahamCard(variant = SahamCardVariant.Outlined) {
                Column {
                    Text("JIKA KENA TARGET", style = MaterialTheme.typography.labelSmall, color = extra.success)
                    Text(
                        "${if (profit >= 0) "+" else ""}${rupiah(profit)}",
                        style = MaterialTheme.typography.titleMedium,
                        color = extra.success,
                    )
                }
            }
        }

        result.riskRewardRatio?.let { ratio ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("Risk/Reward Ratio", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    "1 : ${"%.2f".format(ratio)}",
                    style = MaterialTheme.typography.titleSmall,
                    color = when {
                        ratio >= 2 -> extra.success
                        ratio >= 1 -> MaterialTheme.colorScheme.tertiary
                        else -> MaterialTheme.colorScheme.error
                    },
                )
            }
        }

        if (result.finalLot == 0) {
            InfoBanner("Modal atau budget risiko terlalu kecil untuk 1 lot penuh (100 lembar) di harga ini.")
        }
    }
}

@Composable
private fun InfoBanner(message: String) {
    SahamCard(variant = SahamCardVariant.Filled) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = MaterialTheme.colorScheme.tertiary)
            Spacer(Modifier.width(8.dp))
            Text(message, style = MaterialTheme.typography.bodySmall)
        }
    }
}
