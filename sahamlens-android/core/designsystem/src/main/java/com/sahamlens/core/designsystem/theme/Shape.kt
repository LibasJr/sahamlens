package com.sahamlens.core.designsystem.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

// Skala shape Build 001: None / 8 / 12 / 16 / 28 / Full(pill).
// Extra Small dipakai untuk chip & tombol kecil, Medium untuk kartu standar,
// Large untuk Bottom Sheet/Dialog/FAB besar, Extra Large untuk Hero card.
val SahamLensShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

// Radius pill penuh - dipakai manual (bukan lewat Shapes M3) untuk Button/Badge/Chip.
val SahamLensPillShape = RoundedCornerShape(percent = 50)
