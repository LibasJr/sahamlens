package com.sahamlens.app.portfolio

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.sahamlens.app.common.PlaceholderScreen

/** Halaman Portfolio penuh (holdings, riwayat transaksi) belum dispesifikasikan sebagai BUILD tersendiri. */
@Composable
fun PortfolioScreen(modifier: Modifier = Modifier) {
    PlaceholderScreen(
        title = "Portfolio",
        note = "Holdings & riwayat transaksi lengkap - menyusul di build lanjutan.",
        modifier = modifier,
    )
}
