package com.sahamlens.core.designsystem.theme

import androidx.compose.ui.graphics.Color

// Token warna BUILD 001 - satu-satunya sumber kebenaran untuk hex SahamLens Android.
// Nilai ini diwarisi dari sistem "Nucleus" di web (tv.blue/tv.green/tv.red/tv.gold)
// supaya identitas merek konsisten lintas platform, dipetakan ke peran M3.

// --- Dark (tema utama produk) ---
val DarkPrimary = Color(0xFF4F94FF)
val DarkOnPrimary = Color(0xFF0A1119)
val DarkPrimaryContainer = Color(0xFF12294F)
val DarkOnPrimaryContainer = Color(0xFFD7E6FF)

val DarkTertiary = Color(0xFFE3C567) // AI Council / Premium - sengaja dipisah dari Primary
val DarkOnTertiary = Color(0xFF3A3116)
val DarkTertiaryContainer = Color(0xFF3A3116)
val DarkOnTertiaryContainer = Color(0xFFF3E4B8)

// Error/on-error dipakai ulang sebagai bahasa warna Sell/Danger - satu makna, bukan dua sistem warna.
val DarkError = Color(0xFFF0615C)
val DarkOnError = Color(0xFF3A0A0A)
val DarkErrorContainer = Color(0xFF3A1618)
val DarkOnErrorContainer = Color(0xFFFFDAD8)

val DarkBackground = Color(0xFF0A1119)
val DarkOnBackground = Color(0xFFF3F4F6)
val DarkSurface = Color(0xFF101929)
val DarkOnSurface = Color(0xFFF3F4F6)
val DarkSurfaceVariant = Color(0xFF172137)
val DarkOnSurfaceVariant = Color(0xFF8B94B6)
val DarkOutline = Color(0xFF232E42)
val DarkOutlineVariant = Color(0xFF34405A)

// --- Light (fallback OS-level, bukan pilihan yang dipromosikan) ---
val LightPrimary = Color(0xFF2461E0)
val LightOnPrimary = Color(0xFFFFFFFF)
val LightPrimaryContainer = Color(0xFFDCE8FF)
val LightOnPrimaryContainer = Color(0xFF0A1E42)

val LightTertiary = Color(0xFF8A6A12)
val LightOnTertiary = Color(0xFFFFFFFF)
val LightTertiaryContainer = Color(0xFFFBF0CE)
val LightOnTertiaryContainer = Color(0xFF2B2000)

val LightError = Color(0xFFD8433D)
val LightOnError = Color(0xFFFFFFFF)
val LightErrorContainer = Color(0xFFFBE4E3)
val LightOnErrorContainer = Color(0xFF410E0B)

val LightBackground = Color(0xFFF6F7FA)
val LightOnBackground = Color(0xFF10141F)
val LightSurface = Color(0xFFFFFFFF)
val LightOnSurface = Color(0xFF10141F)
val LightSurfaceVariant = Color(0xFFF2F4F8)
val LightOnSurfaceVariant = Color(0xFF5B6478)
val LightOutline = Color(0xFFC9CEDA)
val LightOutlineVariant = Color(0xFFE2E5EC)

// --- Ekstensi semantik di luar peran M3 baku (M3 tidak punya slot "success") ---
val DarkSuccess = Color(0xFF10B981)
val DarkOnSuccess = Color(0xFF06251C)
val DarkSuccessContainer = Color(0xFF0C2A22)
val DarkOnSuccessContainer = Color(0xFFB7F4DC)

val LightSuccess = Color(0xFF0E8F63)
val LightOnSuccess = Color(0xFFFFFFFF)
val LightSuccessContainer = Color(0xFFE1F5EC)
val LightOnSuccessContainer = Color(0xFF002115)
