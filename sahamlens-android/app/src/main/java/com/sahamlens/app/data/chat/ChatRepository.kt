package com.sahamlens.app.data.chat

import com.sahamlens.core.network.SahamLensApi
import com.sahamlens.core.network.model.ChatHistoryTurnDto
import com.sahamlens.core.network.model.ChatRequestDto
import com.sahamlens.core.network.model.ChatResponseDto
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

/** AI Council - memanggil POST /api/chat asli, sama seperti web. Riwayat
 * dikirim ulang tiap giliran (server tidak menyimpan sesi chat) supaya AI tidak "amnesia".
 *
 * Server SENGAJA membalas body {role, content, errorCode} yang valid bahkan di status
 * non-2xx (400 prompt kosong, 429 rate limit/kuota tamu habis, 503 provider AI belum
 * terkonfigurasi, 504 timeout) - `content`-nya adalah pesan aman & spesifik yang MEMANG
 * dimaksudkan tampil ke pengguna, sama seperti alur `components/AIChat.tsx` di web
 * ("jangan membuang content itu atau menyamakan semua kegagalan menjadi satu pesan
 * palsu"). Body error dibaca manual di sini karena Retrofit tidak mengekspos body untuk
 * status non-2xx lewat tipe kembalian biasa - lihat komentar di [SahamLensApi.chat]. */
class ChatRepository(private val api: SahamLensApi) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun send(prompt: String, context: String, history: List<ChatHistoryTurnDto>): Result<String> = runCatching {
        val response = api.chat(ChatRequestDto(prompt = prompt, context = context, history = history))
        val body = if (response.isSuccessful) {
            response.body()
        } else {
            response.errorBody()?.string()?.let { raw -> runCatching { json.decodeFromString<ChatResponseDto>(raw) }.getOrNull() }
        }
        body?.content?.takeIf { it.isNotBlank() }
            ?: error("Balasan AI Council kosong (status ${response.code()}).")
    }
}
