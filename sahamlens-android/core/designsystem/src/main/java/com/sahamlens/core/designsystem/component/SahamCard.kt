package com.sahamlens.core.designsystem.component

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Tiga varian Card Build 001:
 * - Elevated: permukaan + level 1, untuk konten netral berdiri sendiri (mis. AI Summary).
 * - Filled: surface container solid tanpa bayangan, untuk grup data (mis. Portfolio Summary).
 * - Outlined: garis 1dp tanpa isi, untuk list padat (mis. baris Watchlist) agar tidak berat.
 */
enum class SahamCardVariant { Elevated, Filled, Outlined }

@Composable
fun SahamCard(
    modifier: Modifier = Modifier,
    variant: SahamCardVariant = SahamCardVariant.Elevated,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    content: @Composable () -> Unit,
) {
    when (variant) {
        SahamCardVariant.Elevated -> ElevatedCard(
            modifier = modifier,
            shape = MaterialTheme.shapes.medium,
            elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
        ) {
            Box(modifier = Modifier.padding(contentPadding)) { content() }
        }

        SahamCardVariant.Filled -> Card(
            modifier = modifier,
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        ) {
            Box(modifier = Modifier.padding(contentPadding)) { content() }
        }

        SahamCardVariant.Outlined -> OutlinedCard(
            modifier = modifier,
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
        ) {
            Box(modifier = Modifier.padding(contentPadding)) { content() }
        }
    }
}
