package com.sahamlens.app.data.portfolio

import com.sahamlens.core.network.SahamLensApi
import com.sahamlens.core.network.model.CreateTransactionRequestDto
import com.sahamlens.core.network.model.HoldingDto
import com.sahamlens.core.network.model.PortfolioDto
import com.sahamlens.core.network.parseApiError

data class PortfolioData(
    val portfolio: PortfolioDto,
    val holdings: List<HoldingDto>,
)

/** Portfolio (Akun Demo) - langsung dari server, tidak ada cache lokal (beda dari Watchlist)
 * karena angka cash/holdings HARUS selalu mutakhir begitu user Buy/Sell dari device lain. */
class PortfolioRepository(private val api: SahamLensApi) {
    suspend fun getSummary(): Result<PortfolioData> = runCatching {
        val response = api.getPortfolio()
        PortfolioData(portfolio = response.portfolio, holdings = response.holdings)
    }

    suspend fun buy(symbol: String, price: Double, lots: Int): Result<Unit> =
        trade(CreateTransactionRequestDto(type = "BUY", symbol = symbol, price = price, lots = lots))

    suspend fun sell(symbol: String, price: Double, lots: Int): Result<Unit> =
        trade(CreateTransactionRequestDto(type = "SELL", symbol = symbol, price = price, lots = lots))

    /** Server menolak transaksi dengan pesan spesifik (cash tidak cukup, lot tidak cukup,
     * harga tidak wajar) di body {error, code} status 400 - itu HARUS sampai ke UI, bukan
     * ditelan jadi "Transaksi gagal. Coba lagi." generik yang tidak membantu user tahu
     * harus berbuat apa. Pesan ini muncul di [Result.exceptionOrNull]'s message. */
    private suspend fun trade(request: CreateTransactionRequestDto): Result<Unit> = runCatching {
        val response = api.createTransaction(request)
        if (!response.isSuccessful) {
            val message = response.parseApiError()?.error?.takeIf { it.isNotBlank() }
                ?: "Transaksi gagal (status ${response.code()})."
            error(message)
        }
    }
}
