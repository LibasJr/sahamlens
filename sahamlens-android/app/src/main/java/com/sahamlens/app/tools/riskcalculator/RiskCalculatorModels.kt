package com.sahamlens.app.tools.riskcalculator

import kotlin.math.floor

data class RiskCalculatorUiState(
    val symbol: String = "BBCA",
    val isLoadingPrice: Boolean = false,
    val modal: String = "10000000",
    val riskPct: String = "1",
    val entry: String = "",
    val stopLoss: String = "",
    val target: String = "",
)

data class RiskCalculatorResult(
    val hasValidInput: Boolean,
    val finalLot: Int,
    val finalShares: Int,
    val capitalNeeded: Double,
    val maxLossRp: Double,
    val maxLossPct: Double,
    val potentialProfitRp: Double?,
    val riskRewardRatio: Double?,
    val boundByCapital: Boolean,
)

/** Murni matematika dari input pengguna - port 1:1 dari app/risk-calculator/page.tsx di web
 * (position sizing dibatasi budget risiko DAN modal tersedia, lot final = yang lebih kecil),
 * supaya hasilnya identik dengan kalkulator di web, bukan rumus baru yang ditebak ulang. */
fun calculateRisk(modal: Double, riskPct: Double, entry: Double, stopLoss: Double, target: Double): RiskCalculatorResult {
    val riskPerShare = entry - stopLoss
    val riskBudgetRp = modal * (riskPct / 100)
    val hasValidInput = entry > 0 && stopLoss > 0 && riskPerShare > 0 && modal > 0

    val maxLotByRisk = if (hasValidInput) floor(riskBudgetRp / (riskPerShare * 100)).toInt() else 0
    val maxLotByCapital = if (hasValidInput) floor(modal / (entry * 100)).toInt() else 0
    val finalLot = maxOf(0, minOf(maxLotByRisk, maxLotByCapital))
    val finalShares = finalLot * 100
    val capitalNeeded = finalShares * entry
    val maxLossRp = finalShares * riskPerShare
    val maxLossPct = if (modal > 0) (maxLossRp / modal) * 100 else 0.0

    val rewardPerShare = if (target > 0) target - entry else null
    val potentialProfitRp = rewardPerShare?.let { finalShares * it }
    val riskRewardRatio = if (rewardPerShare != null && riskPerShare > 0) rewardPerShare / riskPerShare else null
    val boundByCapital = hasValidInput && maxLotByCapital < maxLotByRisk

    return RiskCalculatorResult(
        hasValidInput = hasValidInput,
        finalLot = finalLot,
        finalShares = finalShares,
        capitalNeeded = capitalNeeded,
        maxLossRp = maxLossRp,
        maxLossPct = maxLossPct,
        potentialProfitRp = potentialProfitRp,
        riskRewardRatio = riskRewardRatio,
        boundByCapital = boundByCapital,
    )
}
