package com.sahamlens.core.designsystem.component

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Build 006 - skeleton shimmer (1200ms loop linear). Dipakai untuk kartu/baris yang sedang
 * memuat (Portfolio, Watchlist) - bukan spinner generik (Build 001). Mode statis (tanpa animasi)
 * saat preview/reduced-motion, supaya tidak melanggar prinsip hormati preferensi aksesibilitas.
 */
@Composable
fun ShimmerBox(
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 8.dp,
) {
    val inPreview = LocalInspectionMode.current
    val baseColor = MaterialTheme.colorScheme.surfaceVariant
    val highlightColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)

    if (inPreview) {
        androidx.compose.foundation.layout.Box(
            modifier = modifier.background(baseColor, androidx.compose.foundation.shape.RoundedCornerShape(cornerRadius)),
        )
        return
    }

    val transition = rememberInfiniteTransition(label = "shimmer")
    val translate by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "shimmerTranslate",
    )

    val brush = Brush.linearGradient(
        colors = listOf(baseColor, highlightColor, baseColor),
        start = Offset(translate * 600f - 200f, 0f),
        end = Offset(translate * 600f + 200f, 0f),
    )

    androidx.compose.foundation.layout.Box(
        modifier = modifier.background(brush, androidx.compose.foundation.shape.RoundedCornerShape(cornerRadius)),
    )
}

/** Baris skeleton siap pakai untuk list (Watchlist/Portfolio) - lebar teks & angka pura-pura. */
@Composable
fun ShimmerLineRow(modifier: Modifier = Modifier) {
    androidx.compose.foundation.layout.Row(
        modifier = modifier,
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
    ) {
        ShimmerBox(modifier = Modifier.width(64.dp).height(16.dp))
        ShimmerBox(modifier = Modifier.width(96.dp).height(16.dp))
    }
}
