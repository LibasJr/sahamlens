package com.sahamlens.core.designsystem.component

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.theme.SahamLensTheme

data class Candle(val open: Double, val high: Double, val low: Double, val close: Double)

/**
 * Candlestick chart Canvas murni - tanpa library pihak ketiga (dihindari sengaja: versi Vico
 * terbaru tidak bisa diverifikasi tanpa akses internet saat ditulis, lebih aman menggambar
 * sendiri daripada menebak nomor versi dependency). Auto-scale dari min/max histori yang
 * diberikan - tidak butuh state/interaksi, cukup untuk gambaran tren cepat di Detail Saham.
 */
@Composable
fun CandlestickChart(
    candles: List<Candle>,
    modifier: Modifier = Modifier,
) {
    val bullColor = SahamLensTheme.extraColors.success
    val bearColor = MaterialTheme.colorScheme.error
    val gridColor = MaterialTheme.colorScheme.outlineVariant

    Canvas(modifier = modifier.fillMaxWidth().height(220.dp)) {
        if (candles.isEmpty()) return@Canvas

        val maxPrice = candles.maxOf { it.high }
        val minPrice = candles.minOf { it.low }
        val range = (maxPrice - minPrice).takeIf { it > 0 } ?: 1.0

        val slotWidth = size.width / candles.size
        val candleWidth = (slotWidth * 0.6f).coerceAtLeast(1f)

        // Garis grid horizontal tipis (25/50/75%) - konteks skala tanpa label angka (Detail
        // Saham sudah menampilkan harga terkini di Hero, chart ini cuma untuk bentuk tren).
        listOf(0.25f, 0.5f, 0.75f).forEach { fraction ->
            val y = size.height * fraction
            drawLine(
                color = gridColor.copy(alpha = 0.4f),
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = 1f,
            )
        }

        candles.forEachIndexed { index, candle ->
            val isBull = candle.close >= candle.open
            val color = if (isBull) bullColor else bearColor
            val xCenter = slotWidth * index + slotWidth / 2

            fun yFor(price: Double): Float {
                val fraction = ((maxPrice - price) / range).toFloat()
                return fraction * size.height
            }

            // Wick (high-low)
            drawLine(
                color = color,
                start = Offset(xCenter, yFor(candle.high)),
                end = Offset(xCenter, yFor(candle.low)),
                strokeWidth = 2f,
                cap = StrokeCap.Round,
            )

            // Body (open-close)
            val bodyTop = yFor(maxOf(candle.open, candle.close))
            val bodyBottom = yFor(minOf(candle.open, candle.close))
            val bodyHeight = (bodyBottom - bodyTop).coerceAtLeast(2f)
            drawRect(
                color = color,
                topLeft = Offset(xCenter - candleWidth / 2, bodyTop),
                size = androidx.compose.ui.geometry.Size(candleWidth, bodyHeight),
            )
        }
    }
}
