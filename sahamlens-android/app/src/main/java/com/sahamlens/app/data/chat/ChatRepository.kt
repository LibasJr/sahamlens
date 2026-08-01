package com.sahamlens.app.data.chat

import com.sahamlens.core.network.SahamLensApi
import com.sahamlens.core.network.model.ChatHistoryTurnDto
import com.sahamlens.core.network.model.ChatRequestDto

/** AI Council - memanggil POST /api/chat asli, sama seperti web. Riwayat
 * dikirim ulang tiap giliran (server tidak menyimpan sesi chat) supaya AI tidak "amnesia". */
class ChatRepository(private val api: SahamLensApi) {
    suspend fun send(prompt: String, context: String, history: List<ChatHistoryTurnDto>): Result<String> = runCatching {
        val response = api.chat(ChatRequestDto(prompt = prompt, context = context, history = history))
        response.content
    }
}
