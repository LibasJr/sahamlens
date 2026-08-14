package com.sahamlens.core.designsystem.component

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Tiga varian Card Build 001:
 * - Elevated: permukaan + level 1, untuk konten netral berdiri sendiri (mis. AI Summary).
 * - Filled: surface container solid tanpa bayangan, untuk grup data (mis. Portfolio Summary).
 * - Outlined: garis 1dp tanpa isi, untuk list padat (mis. baris Watchlist) agar tidak berat.
 *
 * Build 008 - [onClick] opsional BAWAAN komponen (ripple M3 asli + [pressScale] disatukan
 * lewat [MutableInteractionSource] yang sama), bukan sesuatu yang tiap layar rakit sendiri
 * lewat `Modifier.clickable{}` manual. Ini sekaligus jadi pagar terhadap kelas bug yang pernah
 * terjadi di app ini ("dead click handler" - parameter onXxxClick diterima tapi lupa
 * disambungkan ke modifier): kalau kartu dibuat lewat SahamCard(onClick = ...), klik-nya
 * otomatis nyala, tidak mungkin lupa dipasang.
 *
 * SENGAJA bercabang ke overload Card TANPA onClick saat [onClick] null (bukan overload
 * clickable dengan `enabled = false`) - overload clickable selalu menandai node sebagai
 * "button" ke accessibility service (TalkBack akan mengumumkan "dinonaktifkan/disabled
 * button" untuk kartu statis seperti Portfolio Summary yang memang tidak pernah diklik),
 * jadi kartu non-klik WAJIB tetap lewat jalur lama yang murni dekoratif.
 */
enum class SahamCardVariant { Elevated, Filled, Outlined }

@Composable
fun SahamCard(
    modifier: Modifier = Modifier,
    variant: SahamCardVariant = SahamCardVariant.Elevated,
    contentPadding: PaddingValues = PaddingValues(16.dp),
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    if (onClick == null) {
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
        return
    }

    val interactionSource = remember { MutableInteractionSource() }
    val clickModifier = modifier.pressScale(interactionSource)

    when (variant) {
        SahamCardVariant.Elevated -> ElevatedCard(
            onClick = onClick,
            modifier = clickModifier,
            shape = MaterialTheme.shapes.medium,
            elevation = CardDefaults.elevatedCardElevation(defaultElevation = 1.dp),
            interactionSource = interactionSource,
        ) {
            Box(modifier = Modifier.padding(contentPadding)) { content() }
        }

        SahamCardVariant.Filled -> Card(
            onClick = onClick,
            modifier = clickModifier,
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
            interactionSource = interactionSource,
        ) {
            Box(modifier = Modifier.padding(contentPadding)) { content() }
        }

        SahamCardVariant.Outlined -> OutlinedCard(
            onClick = onClick,
            modifier = clickModifier,
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
            interactionSource = interactionSource,
        ) {
            Box(modifier = Modifier.padding(contentPadding)) { content() }
        }
    }
}
