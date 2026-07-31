package com.sahamlens.app.stockdetail

/** Bentuk data Detail Saham (Build 004) - dipetakan ke /api/stock/[ticker], /fundamental, DCF, Bandar Flow nyata di Build 007. */
data class StockDetailUiState(
    val ticker: String,
    val name: String,
    val sector: String,
    val price: Double,
    val changePct: Double,
    val consensus: String,
    val confidencePct: Int,
    val aiSummary: String,
    val technicalNote: String,
    val fundamentalNote: String,
    val dcfNote: String,
    val bandarNote: String,
)

fun sampleStockDetail(ticker: String) = StockDetailUiState(
    ticker = ticker,
    name = "Bank Central Asia Tbk",
    sector = "Financials",
    price = 8_925.0,
    changePct = 1.2,
    consensus = "STRONG BUY",
    confidencePct = 92,
    aiSummary = "Uptrend terkonfirmasi, harga berada di atas MA20 dan MA50. Volume 18% di atas rata-rata 20 hari, minat pasar meningkat.",
    technicalNote = "8 dari 10 filter menunjukkan sinyal BULLISH. RSI 58 - netral cenderung beli.",
    fundamentalNote = "PBV 4.2x, ROE 21%, dividend yield 2.8% - valuasi wajar untuk bank kelas kakap.",
    dcfNote = "Nilai intrinsik estimasi Rp 9.400 - margin of safety tipis di harga saat ini.",
    bandarNote = "Net foreign flow 5 hari terakhir: NET BUY, akumulasi terlihat di volume sesi 2.",
)
