package com.sahamlens.core.designsystem.component

import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Filter chip: sektor, timeframe chart (1H/1D/1M/1Y), kategori sinyal. Selected = Primary Container + centang. */
@Composable
fun SahamFilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        modifier = modifier,
        colors = FilterChipDefaults.filterChipColors(),
    )
}

/** Assist chip: aksi kontekstual singkat, mis. "Lihat Alasan AI" di kartu rekomendasi. */
@Composable
fun SahamAssistChip(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    AssistChip(
        onClick = onClick,
        label = { Text(label) },
        modifier = modifier,
    )
}
