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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.CandlestickChart
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import com.sahamlens.core.designsystem.component.SahamButton
import com.sahamlens.core.designsystem.component.SahamButtonVariant
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.component.ShimmerBox
import com.sahamlens.core.designsystem.theme.SahamLensTheme

// Dipakai untuk dua kosakata backend yang beda: konsensus skor komposit ("STRONG BUY"/"SELL"/
// "HOLD") DAN keputusan per-analyzer teknikal/fundamental ("BULLISH"/"BEARISH"/"NEUTRAL",
// "UNDERVALUED (BULLISH ..)"/"OVERVALUED (BEARISH ..)") - keduanya perlu dikenali di sini,
// bukan cuma BUY/SELL, supaya badge Technical & Fundamental tidak selalu jatuh ke abu-abu.
private fun badgeVariantFor(consensus: String) = when {
    consensus.contains("BUY") || consensus.contains("BULLISH") || consensus.contains("UNDERVALUED") -> SahamBadgeVariant.Success
    consensus.contains("SELL") || consensus.contains("BEARISH") || consensus.contains("OVERVALUED") -> SahamBadgeVariant.Danger
    else -> SahamBadgeVariant.Neutral
}

private fun rupiah(value: Double) = "Rp ${"%,.0f".format(value).replace(',', '.')}"

/**
 * Detail Saham - Hero tetap (harga, Buy/Sell) di [content], Bottom Sheet berisi AI Summary +
 * Chart di posisi peek, lalu section expandable (Technical/Fundamental/DCF/Bandar Flow) supaya
 * tidak jadi halaman sepanjang 3 km. 401/402 ditangani jujur (login/Pro), bukan data kosong diam-diam.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalSharedTransitionApi::class)
@Composable
fun StockDetailScreen(
    ticker: String,
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedContentScope: AnimatedContentScope? = null,
    onBack: () -> Unit = {},
    onRequireLogin: () -> Unit = {},
) {
    val viewModel: StockDetailViewModel = viewModel(
        factory = StockDetailViewModel.factory(ticker, AppGraph.stockDetailRepository, AppGraph.portfolioRepository),
    )
    val state by viewModel.uiState.collectAsState()
    var tradeDialog by remember { mutableStateOf<TradeAction?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }

    // Sukses/gagal transaksi lewat Snackbar auto-dismiss (bukan AlertDialog yang memaksa tap
    // "OK") - hasil yang sudah pasti (bukan pilihan) tidak perlu memblokir aksi berikutnya.
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
            StockDetailSheetContent(state, onBuySell = { action -> tradeDialog = action })
        },
    ) { innerPadding ->
        StockDetailHero(
            state = state,
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

enum class TradeAction { BUY, SELL }

@Composable
private fun TradeDialog(action: TradeAction, price: Double, onDismiss: () -> Unit, onConfirm: (Int) -> Unit) {
    var lotsText by remember { mutableStateOf("1") }
    val lots = lotsText.toIntOrNull() ?: 0
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (action == TradeAction.BUY) "Beli Saham" else "Jual Saham") },
        text = {
            Column {
                Text("Harga: ${rupiah(price)}", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = lotsText,
                    onValueChange = { lotsText = it.filter(Char::isDigit) },
                    label = { Text("Jumlah Lot") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                )
                if (lots > 0) {
                    Spacer(Modifier.height(8.dp))
                    Text("Total: ${rupiah(lots * 100 * price)}", style = MaterialTheme.typography.labelLarge)
                }
            }
        },
        confirmButton = {
            SahamButton(
                if (action == TradeAction.BUY) "Beli" else "Jual",
                onClick = { if (lots > 0) onConfirm(lots) },
                variant = if (action == TradeAction.BUY) SahamButtonVariant.FilledSuccess else SahamButtonVariant.FilledDanger,
                enabled = lots > 0,
            )
        },
        dismissButton = { SahamButton("Batal", onClick = onDismiss, variant = SahamButtonVariant.Text) },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StockDetailErrorState(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    message: String,
    actionLabel: String?,
    onAction: () -> Unit,
    onBack: () -> Unit,
) {
    androidx.compose.material3.Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali") }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (actionLabel != null) {
                Spacer(Modifier.height(16.dp))
                SahamButton(actionLabel, onClick = onAction)
            }
        }
    }
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun StockDetailHero(
    state: StockDetailUiState,
    modifier: Modifier = Modifier,
    sharedTransitionScope: SharedTransitionScope? = null,
    animatedContentScope: AnimatedContentScope? = null,
    onBuy: () -> Unit = {},
    onSell: () -> Unit = {},
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
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SahamButton("Buy", onClick = onBuy, variant = SahamButtonVariant.FilledSuccess, modifier = Modifier.weight(1f))
            SahamButton("Sell", onClick = onSell, variant = SahamButtonVariant.FilledDanger, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun StockDetailSheetContent(state: StockDetailUiState, onBuySell: (TradeAction) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(4.dp).padding(top = 4.dp))

        Text("AI Summary", style = MaterialTheme.typography.titleSmall)
        SahamCard(variant = SahamCardVariant.Filled) {
            if (state.isLoading) {
                ShimmerBox(modifier = Modifier.fillMaxWidth().height(48.dp))
            } else {
                Text(
                    state.aiSummary.ifBlank { "Belum ada ringkasan AI untuk saham ini." },
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }

        Text("Chart", style = MaterialTheme.typography.titleSmall)
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

        ExpandableSection(
            title = "Technical",
            initiallyExpanded = false,
        ) {
            if (state.technicalRows.isEmpty()) {
                Text("Belum ada data.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                state.technicalRows.forEach { row ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(row.label, style = MaterialTheme.typography.bodyMedium)
                            Text(row.value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        SahamBadge(row.decision, variant = badgeVariantFor(row.decision))
                    }
                }
            }
        }

        ExpandableSection(
            title = "Fundamental",
            initiallyExpanded = false,
        ) {
            if (state.fundamentalRows.isEmpty()) {
                Text("Belum ada data.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                state.fundamentalConsensus?.let {
                    SahamBadge(it, variant = badgeVariantFor(it))
                    Spacer(Modifier.height(6.dp))
                }
                state.fundamentalRows.forEach { row ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(row.label, style = MaterialTheme.typography.bodyMedium)
                            Text(row.value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        SahamBadge(row.decision, variant = badgeVariantFor(row.decision))
                    }
                }
            }
        }

        ExpandableSection(title = "DCF", initiallyExpanded = false) {
            val dcf = state.dcf
            when {
                dcf == null -> Text("Memuat...", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                dcf.notApplicableReason != null -> Text(dcf.executiveSummary, style = MaterialTheme.typography.bodyMedium)
                else -> Column {
                    dcf.fairValue?.let {
                        Text("Nilai Wajar: ${rupiah(it)}", style = MaterialTheme.typography.titleSmall)
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(dcf.executiveSummary, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        ExpandableSection(title = "Bandar Flow", initiallyExpanded = false) {
            Text(
                state.bandarNote ?: "Belum ada data.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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
private fun ExpandableSection(title: String, initiallyExpanded: Boolean, content: @Composable () -> Unit) {
    var expanded by remember { mutableStateOf(initiallyExpanded) }
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
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
            Box(modifier = Modifier.padding(bottom = 8.dp)) { content() }
        }
    }
}
