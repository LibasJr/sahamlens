package com.sahamlens.app.data.portfolio

import com.sahamlens.core.network.SahamLensApi
import com.sahamlens.core.network.model.CreateTransactionRequestDto
import com.sahamlens.core.network.model.HoldingDto
import com.sahamlens.core.network.model.PortfolioDto

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

    suspend fun buy(symbol: String, price: Double, lots: Int): Result<Unit> = runCatching {
        api.createTransaction(CreateTransactionRequestDto(type = "BUY", symbol = symbol, price = price, lots = lots))
        Unit
    }

    suspend fun sell(symbol: String, price: Double, lots: Int): Result<Unit> = runCatching {
        api.createTransaction(CreateTransactionRequestDto(type = "SELL", symbol = symbol, price = price, lots = lots))
        Unit
    }
}
