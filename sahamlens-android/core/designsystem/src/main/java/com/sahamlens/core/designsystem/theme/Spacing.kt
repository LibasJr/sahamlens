package com.sahamlens.core.designsystem.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Skala spacing 4dp-based - sebelumnya tiap layar menulis dp literal sendiri-sendiri (20.dp,
 * 16.dp, dst tersebar) tanpa satu sumber kebenaran. Nilai di sini SAMA seperti yang sudah
 * dipakai konsisten di semua layar (tidak mengubah tampilan yang sudah ada), cuma diberi nama.
 */
object SahamLensSpacing {
    val xs: Dp = 4.dp
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 20.dp
    val xxl: Dp = 24.dp
    val xxxl: Dp = 32.dp
}

/** Elevation Build 001 - 3 level cukup untuk hierarki kartu/sheet/dialog produk ini. */
object SahamLensElevation {
    val level0: Dp = 0.dp
    val level1: Dp = 1.dp
    val level2: Dp = 3.dp
    val level3: Dp = 6.dp
}
