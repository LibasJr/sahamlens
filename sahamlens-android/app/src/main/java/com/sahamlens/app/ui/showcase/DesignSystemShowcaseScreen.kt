package com.sahamlens.app.ui.showcase

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
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.component.SahamAssistChip
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import com.sahamlens.core.designsystem.component.SahamButton
import com.sahamlens.core.designsystem.component.SahamButtonVariant
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.component.SahamFilterChip
import com.sahamlens.core.designsystem.theme.SahamLensTheme

/**
 * Build 001 - Design System Showcase. Bukan layar produk - bukti hidup bahwa token &
 * komponen dasar bekerja bersama, dijangkau lewat Profil > Design System Showcase
 * (berguna untuk QA visual, bukan kode mati).
 */
private data class ShowcaseSection(val title: String, val content: @Composable () -> Unit)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DesignSystemShowcaseScreen(modifier: Modifier = Modifier, onBack: () -> Unit = {}) {
    var timeframe by remember { mutableStateOf("1D") }
    val timeframes = listOf("1H", "1D", "1M", "1Y")

    val sections = listOf(
        ShowcaseSection("Hero — Harga & Consensus") {
            SahamCard(variant = SahamCardVariant.Elevated) {
                Column {
                    Text("BBCA · Bank Central Asia Tbk", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(6.dp))
                    Text("Rp 8.925", style = MaterialTheme.typography.displaySmall)
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SahamBadge("STRONG BUY", variant = SahamBadgeVariant.Success)
                        SahamBadge("+1,2%", variant = SahamBadgeVariant.Neutral)
                        SahamBadge("AI", variant = SahamBadgeVariant.Premium)
                    }
                }
            }
        },
        ShowcaseSection("Button — Buy / Sell / Sekunder") {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SahamButton("Buy", onClick = {}, variant = SahamButtonVariant.FilledSuccess, modifier = Modifier.weight(1f))
                    SahamButton("Sell", onClick = {}, variant = SahamButtonVariant.FilledDanger, modifier = Modifier.weight(1f))
                }
                SahamButton("Tambah ke Watchlist", onClick = {}, variant = SahamButtonVariant.Tonal, modifier = Modifier.fillMaxWidth())
                SahamButton("Batal", onClick = {}, variant = SahamButtonVariant.Outlined, modifier = Modifier.fillMaxWidth())
                SahamButton("Kirim Ulang Kode", onClick = {}, variant = SahamButtonVariant.Text)
            }
        },
        ShowcaseSection("Chip — Timeframe & Assist") {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    timeframes.forEach { tf ->
                        SahamFilterChip(label = tf, selected = tf == timeframe, onClick = { timeframe = tf })
                    }
                }
                SahamAssistChip(label = "Lihat Alasan AI", onClick = {})
            }
        },
        ShowcaseSection("Card — Elevated / Filled / Outlined") {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SahamCard(variant = SahamCardVariant.Elevated) {
                    Text("Elevated — AI Summary", style = MaterialTheme.typography.bodyMedium)
                }
                SahamCard(variant = SahamCardVariant.Filled) {
                    Column {
                        Text("Filled — Portfolio", style = MaterialTheme.typography.titleSmall)
                        Text("Rp 24.850.000 · +2,04% hari ini", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                SahamCard(variant = SahamCardVariant.Outlined) {
                    Text("Outlined — Baris Watchlist: TINS", style = MaterialTheme.typography.bodyMedium)
                }
            }
        },
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Design System Showcase") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali")
                    }
                },
            )
        },
        modifier = modifier,
    ) { innerPadding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(28.dp),
            contentPadding = PaddingValues(vertical = 24.dp),
        ) {
            items(sections) { section ->
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        section.title,
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    section.content()
                }
            }
        }
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF0A1119)
@Composable
private fun DesignSystemShowcasePreview() {
    SahamLensTheme(darkTheme = true) {
        DesignSystemShowcaseScreen()
    }
}
