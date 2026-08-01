package com.sahamlens.app.tools.compare

import com.sahamlens.core.network.model.CompareResponse

data class CompareUiState(
    val symbol1: String = "BBCA",
    val symbol2: String = "BBRI",
    val isLoading: Boolean = false,
    /** 401 = belum login, 402 = fitur Pro, lainnya = kegagalan jaringan biasa, null = belum ada error. */
    val errorCode: Int? = null,
    val result: CompareResponse? = null,
)
