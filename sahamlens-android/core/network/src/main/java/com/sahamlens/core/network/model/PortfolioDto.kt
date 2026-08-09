package com.sahamlens.core.network.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Bentuk asli GET /api/v1/portfolio (handleGetPortfolio di modules/portfolio). */
@Serializable
data class PortfolioSummaryResponse(
    val portfolio: PortfolioDto,
    val holdings: List<HoldingDto> = emptyList(),
    val transactions: List<TransactionDto> = emptyList(),
)

@Serializable
data class PortfolioDto(
    val id: String,
    val cash: Double,
    @SerialName("initial_cash") val initialCash: Double,
)

@Serializable
data class HoldingDto(
    val symbol: String,
    val lots: Int,
    val avgPrice: Double,
    val totalCost: Double,
)

@Serializable
data class TransactionDto(
    val id: String,
    val symbol: String,
    val type: String,
    val price: Double,
    val lots: Int,
    val pnl: Double? = null,
    @SerialName("created_at") val createdAt: String,
)

/** Body POST /api/v1/portfolio/transactions (createTransactionSchema di trade.validator.ts). */
@Serializable
data class CreateTransactionRequestDto(
    val type: String, // "BUY" | "SELL"
    val symbol: String,
    val price: Double,
    val lots: Int,
    val note: String? = null,
)

@Serializable
data class CreateTransactionResponseDto(
    val data: TransactionDto,
)
