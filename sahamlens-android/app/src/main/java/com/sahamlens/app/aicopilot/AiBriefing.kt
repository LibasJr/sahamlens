package com.sahamlens.app.aicopilot

import com.sahamlens.core.network.model.DailyPicksResponse

/**
 * Satu sumber kebenaran untuk kalimat "peluang hari ini" - dipakai BERSAMA oleh
 * [com.sahamlens.app.home.HomeViewModel] (banner 1-baris di Home) dan [AiCopilotViewModel]
 * (sapaan pembuka AI Council), keduanya dari GET /api/daily-picks yang sama. Sebelum ini
 * masing-masing punya hitungan sendiri (Home dari topTechnical, AI Council dari daily-picks)
 * yang bisa menyebut angka berbeda untuk fakta yang sama - AI Council seharusnya satu "pikiran",
 * bukan dua sumber kebenaran yang bisa berselisih.
 */
fun aiOpportunitySentence(picks: DailyPicksResponse?): String = if (picks != null) {
    "Saya menemukan ${picks.attractive.count} saham menarik, ${picks.breakout.count} breakout, dan ${picks.risky.count} berisiko hari ini."
} else {
    "Belum ada sinyal kuat yang terdeteksi hari ini."
}
