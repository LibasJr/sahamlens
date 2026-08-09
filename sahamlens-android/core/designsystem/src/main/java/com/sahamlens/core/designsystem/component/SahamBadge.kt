package com.sahamlens.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.theme.SahamLensPillShape
import com.sahamlens.core.designsystem.theme.SahamLensTheme

/** Badge kecil satu makna: Consensus (Success/Danger/Neutral), Info, atau Premium (AI/gold). */
enum class SahamBadgeVariant { Neutral, Success, Danger, Info, Premium }

private data class BadgeColors(val container: Color, val content: Color)

@Composable
private fun colorsFor(variant: SahamBadgeVariant): BadgeColors {
    val scheme = MaterialTheme.colorScheme
    val extra = SahamLensTheme.extraColors
    return when (variant) {
        SahamBadgeVariant.Neutral -> BadgeColors(scheme.surfaceVariant, scheme.onSurfaceVariant)
        SahamBadgeVariant.Success -> BadgeColors(extra.successContainer, extra.success)
        SahamBadgeVariant.Danger -> BadgeColors(scheme.errorContainer, scheme.error)
        SahamBadgeVariant.Info -> BadgeColors(scheme.primaryContainer, scheme.primary)
        SahamBadgeVariant.Premium -> BadgeColors(scheme.tertiaryContainer, scheme.tertiary)
    }
}

@Composable
fun SahamBadge(
    text: String,
    modifier: Modifier = Modifier,
    variant: SahamBadgeVariant = SahamBadgeVariant.Neutral,
) {
    val colors = colorsFor(variant)
    Text(
        text = text,
        modifier = modifier
            .background(color = colors.container, shape = SahamLensPillShape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        color = colors.content,
        style = MaterialTheme.typography.labelSmall,
    )
}
