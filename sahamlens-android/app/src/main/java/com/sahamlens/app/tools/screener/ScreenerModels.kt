package com.sahamlens.app.tools.screener

import com.sahamlens.core.network.model.ScreenerStockDto

/** Tiga profil risiko persis GET /api/screener?profile=.. di backend - nilai [apiValue] HARUS
 * sama persis dengan string yang divalidasi di app/api/screener/route.ts. */
enum class RiskProfile(val apiValue: String) {
    KONSERVATIF("Konservatif"),
    MODERAT("Moderat"),
    AGRESIF("Agresif"),
}

data class ScreenerUiState(
    val profile: RiskProfile = RiskProfile.MODERAT,
    val isLoading: Boolean = true,
    val error: String? = null,
    val stocks: List<ScreenerStockDto> = emptyList(),
)
