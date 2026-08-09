package com.sahamlens.app.data.stockdetail

import com.sahamlens.core.network.SahamLensApi
import com.sahamlens.core.network.model.DcfResponse
import com.sahamlens.core.network.model.FundamentalResponse
import com.sahamlens.core.network.model.StockDetailResponse

/** GET /api/stock/[ticker] butuh login + akun Pro (402 kalau bukan Pro) - dibiarkan melempar
 * agar ViewModel bisa membedakan pesan "belum Pro" dari kegagalan jaringan biasa. */
class StockDetailRepository(private val api: SahamLensApi) {
    suspend fun getDetail(ticker: String): Result<StockDetailResponse> = runCatching { api.getStockDetail(ticker) }

    suspend fun getDcf(ticker: String): Result<DcfResponse> = runCatching { api.getDcf(ticker) }

    /** Publik (tanpa login/Pro) - tetap tampil walau getDetail() 402. */
    suspend fun getFundamental(ticker: String): Result<FundamentalResponse> = runCatching { api.getFundamental(ticker) }
}
