package com.sahamlens.app.tools.marketpulse

import com.sahamlens.core.network.model.MarketBreadthDto
import com.sahamlens.core.network.model.MarketPulseIndexDto
import com.sahamlens.core.network.model.SectorHeatmapDto

data class MarketPulseUiState(
    val isLoading: Boolean = true,
    /** 401 = belum login, 402 = fitur Pro, lainnya = kegagalan jaringan biasa, null = belum ada error. */
    val errorCode: Int? = null,
    val indices: List<MarketPulseIndexDto> = emptyList(),
    val sectorHeatmap: List<SectorHeatmapDto> = emptyList(),
    val breadth: MarketBreadthDto? = null,
)
