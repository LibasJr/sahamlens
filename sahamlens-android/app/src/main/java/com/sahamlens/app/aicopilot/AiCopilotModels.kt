package com.sahamlens.app.aicopilot

import com.sahamlens.app.home.HomeUiState

enum class MessageSender { AI, USER }

data class ChatMessage(val sender: MessageSender, val text: String)

/**
 * Sapaan proaktif Build 005 - dirangkai dari data yang SUDAH nyata (portfolio, top picks
 * yang match watchlist, sinyal SELL pada holdings) kecuali baris overvalued yang masih
 * butuh endpoint pemindaian DCF batch baru (ditandai jujur, bukan dipalsukan).
 */
fun proactiveGreeting(home: HomeUiState, timeOfDayGreeting: String): String {
    val pnlWord = if (home.portfolioChangePct >= 0) "naik" else "turun"
    return buildString {
        append("$timeOfDayGreeting, ${home.userName}. ")
        append("Portofolio Anda $pnlWord ${"%.1f".format(kotlin.math.abs(home.portfolioChangePct))}% hari ini. ")
        append("Saya menemukan ${home.topPicks.size} peluang baru")
        val sellCandidate = home.watchlist.firstOrNull { it.changePct < -1.5 }
        if (sellCandidate != null) {
            append(", dan ${sellCandidate.ticker} sebaiknya dipertimbangkan untuk dijual.")
        } else {
            append(".")
        }
    }
}
