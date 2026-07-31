package com.sahamlens.core.network.model

import kotlinx.serialization.Serializable

/** Body POST /api/chat - `history` = giliran sebelumnya (role user/assistant) supaya AI
 * tidak "amnesia" kalau satu giliran gagal (lihat catatan di app/api/chat/route.ts web). */
@Serializable
data class ChatRequestDto(
    val prompt: String,
    val context: String = "",
    val history: List<ChatHistoryTurnDto> = emptyList(),
)

@Serializable
data class ChatHistoryTurnDto(
    val role: String, // "user" | "assistant"
    val content: String,
)

@Serializable
data class ChatResponseDto(
    val role: String = "assistant",
    val content: String = "",
)
