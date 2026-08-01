package com.sahamlens.app.stockdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.portfolio.PortfolioRepository
import com.sahamlens.app.data.stockdetail.StockDetailRepository
import com.sahamlens.core.designsystem.component.Candle
import com.sahamlens.core.network.model.DcfResponse
import com.sahamlens.core.network.model.FundamentalResponse
import com.sahamlens.core.network.model.StockDetailResponse
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import retrofit2.HttpException

/**
 * Detail Saham - GET /api/stock/[ticker] (butuh login + Pro, 402 kalau bukan Pro) untuk harga,
 * 10 analyzer, skor komposit, dan histori chart; GET /api/dcf/[ticker] (publik) terpisah untuk
 * valuasi DCF supaya tetap tampil walau analisis teknikal 402. "Bandar Flow" diambil dari
 * analyzer "Foreign Flow (Estimasi Asing)" yang SUDAH ada di response - jujur diberi label
 * "Estimasi" karena backend web sendiri mensimulasikannya (bukan data broker sungguhan).
 */
class StockDetailViewModel(
    private val ticker: String,
    private val stockDetailRepository: StockDetailRepository,
    private val portfolioRepository: PortfolioRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(StockDetailUiState(ticker = ticker))
    val uiState: StateFlow<StockDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorCode = null) }

            val detailResult = stockDetailRepository.getDetail(ticker)
            val dcfResult = stockDetailRepository.getDcf(ticker)
            val dcfState = dcfResult.getOrNull()?.let(::mapDcf)
            val fundamentalResponse = stockDetailRepository.getFundamental(ticker).getOrNull()
            val fundamentalRows = fundamentalResponse?.analyzers?.map { AnalyzerRow(it.label, it.value, it.decision) } ?: emptyList()
            val fundamentalConsensus = fundamentalResponse?.consensus

            detailResult.fold(
                onSuccess = { response -> _uiState.value = response.toState(dcfState, fundamentalRows, fundamentalConsensus) },
                onFailure = { error ->
                    val code = (error as? HttpException)?.code()
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            errorCode = code ?: -1,
                            dcf = dcfState,
                            fundamentalRows = fundamentalRows,
                            fundamentalConsensus = fundamentalConsensus,
                        )
                    }
                },
            )
        }
    }

    fun buy(lots: Int) = trade(lots) { symbol, price, lot -> portfolioRepository.buy(symbol, price, lot) }

    fun sell(lots: Int) = trade(lots) { symbol, price, lot -> portfolioRepository.sell(symbol, price, lot) }

    private fun trade(lots: Int, action: suspend (String, Double, Int) -> Result<Unit>) {
        viewModelScope.launch {
            val price = _uiState.value.price
            val result = action(ticker, price, lots)
            _uiState.update {
                it.copy(
                    tradeMessage = if (result.isSuccess) "Transaksi $lots lot berhasil." else "Transaksi gagal. Coba lagi.",
                )
            }
        }
    }

    fun clearTradeMessage() {
        _uiState.update { it.copy(tradeMessage = null) }
    }

    private fun mapDcf(dcf: DcfResponse): DcfUiState = DcfUiState(
        fairValue = dcf.quant?.fairValue,
        valuationStatus = dcf.quant?.valuationStatus,
        notApplicableReason = dcf.notApplicableReason,
        executiveSummary = dcf.analysis?.executiveSummary ?: "",
    )

    private fun StockDetailResponse.toState(
        dcf: DcfUiState?,
        fundamentalRows: List<AnalyzerRow>,
        fundamentalConsensus: String?,
    ): StockDetailUiState {
        val candles = stock?.history?.takeLast(60)?.map {
            Candle(open = it.open, high = it.high, low = it.low, close = it.close)
        } ?: emptyList()
        val bandar = analyzers.firstOrNull { it.label.contains("Foreign Flow") }
        return StockDetailUiState(
            ticker = ticker,
            isLoading = false,
            price = price,
            changePct = stock?.changePct ?: 0.0,
            consensus = consensus,
            totalScore = scoring?.totalScore ?: 0,
            aiSummary = scoring?.alasan3Poin?.joinToString(" ") ?: "",
            candles = candles,
            technicalRows = analyzers
                .filterNot { it.label.contains("Foreign Flow") }
                .map { AnalyzerRow(it.label, it.value, it.decision) },
            fundamentalRows = fundamentalRows,
            fundamentalConsensus = fundamentalConsensus,
            bandarNote = bandar?.let { "${it.value} (estimasi, bukan data broker resmi)" },
            dcf = dcf,
        )
    }

    companion object {
        fun factory(ticker: String, stockDetailRepository: StockDetailRepository, portfolioRepository: PortfolioRepository) = viewModelFactory {
            initializer { StockDetailViewModel(ticker, stockDetailRepository, portfolioRepository) }
        }
    }
}
