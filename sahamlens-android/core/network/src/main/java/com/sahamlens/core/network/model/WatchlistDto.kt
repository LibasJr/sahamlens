package com.sahamlens.core.network.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Bentuk asli GET /api/v1/watchlists -> { data: WatchlistItem[] } (modules/watchlist/types). */
@Serializable
data class WatchlistResponse(
    val data: List<WatchlistItemDto> = emptyList(),
)

@Serializable
data class WatchlistItemDto(
    val symbol: String,
    @SerialName("buy_price") val buyPrice: Double? = null,
    @SerialName("alert_price") val alertPrice: Double? = null,
    val lot: Int? = null,
)
