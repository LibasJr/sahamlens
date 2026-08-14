package com.sahamlens.core.designsystem.component

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.scale

/**
 * Build 008 - "juice" sentuhan yang tadinya tidak ada sama sekali di seluruh app: tombol dan
 * kartu yang bisa diklik hanya punya ripple default M3 tanpa gerakan/getaran apa pun, jadi
 * tekanan jari tidak pernah terasa "direspons" - salah satu sumber utama app terasa kaku/mati
 * dibanding app konsumen modern. Efek ini sengaja KECIL (scale 0.96, spring cepat, haptic
 * tipe ringan) - bukan animasi mencolok yang mengganggu, cuma memberi tahu jari "ya, kesentuh".
 *
 * Dipakai bareng [MutableInteractionSource] yang SAMA dengan yang dipasang ke `clickable`/
 * `Button` supaya sinkron persis dengan status tekan asli komponen (bukan approksimasi/timer).
 */
@Composable
fun rememberPressScale(
    interactionSource: MutableInteractionSource,
    pressedScale: Float = 0.96f,
): Float {
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) pressedScale else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "pressScale",
    )
    return scale
}

/** Modifier siap pakai: scale mengikuti status tekan [interactionSource] yang SAMA dengan yang
 * dipasang ke `clickable`/`Button` pemanggil. HARUS dipanggil dari konteks @Composable. */
@Composable
fun Modifier.pressScale(interactionSource: MutableInteractionSource, pressedScale: Float = 0.96f): Modifier =
    this.scale(rememberPressScale(interactionSource, pressedScale))

/** Getaran ringan sekali ketuk - dipakai untuk aksi yang "berarti" (kirim, buy/sell, simpan ke
 * watchlist), BUKAN untuk setiap ketukan navigasi biasa supaya tidak terasa berlebihan/norak. */
@Composable
fun rememberTapHaptics(): () -> Unit {
    val haptic = LocalHapticFeedback.current
    return { haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
}
