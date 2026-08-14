package com.sahamlens.core.designsystem.component

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.theme.SahamLensPillShape
import com.sahamlens.core.designsystem.theme.SahamLensTheme

/**
 * Hierarki tombol Build 001. Filled hanya untuk SATU aksi utama per layar.
 * FilledSuccess/FilledDanger dipakai khusus Buy/Sell - bukan tombol filled generik
 * yang kebetulan diberi warna hijau/merah, tapi varian bermakna semantik sendiri.
 *
 * Build 008 - setiap varian ikut mengecil sedikit (scale 0.96, spring) saat ditekan lewat
 * [pressScale], disatukan dengan [MutableInteractionSource] milik Button sendiri (bukan
 * approksimasi terpisah) supaya ripple & scale terasa satu gerakan, bukan dua efek yang
 * tidak sinkron. Sebelumnya tombol hanya punya ripple default M3 tanpa gerakan sama sekali.
 */
enum class SahamButtonVariant { Filled, FilledSuccess, FilledDanger, Tonal, Outlined, Text }

@Composable
fun SahamButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: SahamButtonVariant = SahamButtonVariant.Filled,
    enabled: Boolean = true,
) {
    val shape = SahamLensPillShape
    val interactionSource = remember { MutableInteractionSource() }
    val heightModifier = modifier.height(48.dp).pressScale(interactionSource)

    when (variant) {
        SahamButtonVariant.Filled -> Button(
            onClick = onClick,
            modifier = heightModifier,
            enabled = enabled,
            shape = shape,
            interactionSource = interactionSource,
        ) { Text(text) }

        SahamButtonVariant.FilledSuccess -> Button(
            onClick = onClick,
            modifier = heightModifier,
            enabled = enabled,
            shape = shape,
            interactionSource = interactionSource,
            colors = ButtonDefaults.buttonColors(
                containerColor = SahamLensTheme.extraColors.success,
                contentColor = SahamLensTheme.extraColors.onSuccess,
            ),
        ) { Text(text) }

        SahamButtonVariant.FilledDanger -> Button(
            onClick = onClick,
            modifier = heightModifier,
            enabled = enabled,
            shape = shape,
            interactionSource = interactionSource,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error,
                contentColor = MaterialTheme.colorScheme.onError,
            ),
        ) { Text(text) }

        SahamButtonVariant.Tonal -> FilledTonalButton(
            onClick = onClick,
            modifier = heightModifier,
            enabled = enabled,
            shape = shape,
            interactionSource = interactionSource,
        ) { Text(text) }

        SahamButtonVariant.Outlined -> OutlinedButton(
            onClick = onClick,
            modifier = heightModifier,
            enabled = enabled,
            shape = shape,
            interactionSource = interactionSource,
        ) { Text(text) }

        SahamButtonVariant.Text -> TextButton(
            onClick = onClick,
            modifier = modifier.pressScale(interactionSource),
            enabled = enabled,
            interactionSource = interactionSource,
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
        ) { Text(text) }
    }
}
