package com.sahamlens.core.designsystem.component

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.theme.SahamLensPillShape
import com.sahamlens.core.designsystem.theme.SahamLensTheme

/**
 * Hierarki tombol Build 001. Filled hanya untuk SATU aksi utama per layar.
 * FilledSuccess/FilledDanger dipakai khusus Buy/Sell - bukan tombol filled generik
 * yang kebetulan diberi warna hijau/merah, tapi varian bermakna semantik sendiri.
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
    val heightModifier = modifier.height(48.dp)

    when (variant) {
        SahamButtonVariant.Filled -> Button(
            onClick = onClick,
            modifier = heightModifier,
            enabled = enabled,
            shape = shape,
        ) { Text(text) }

        SahamButtonVariant.FilledSuccess -> Button(
            onClick = onClick,
            modifier = heightModifier,
            enabled = enabled,
            shape = shape,
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
        ) { Text(text) }

        SahamButtonVariant.Outlined -> OutlinedButton(
            onClick = onClick,
            modifier = heightModifier,
            enabled = enabled,
            shape = shape,
        ) { Text(text) }

        SahamButtonVariant.Text -> TextButton(
            onClick = onClick,
            modifier = modifier,
            enabled = enabled,
            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
        ) { Text(text) }
    }
}
