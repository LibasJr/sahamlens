package com.sahamlens.core.network.model

import kotlinx.serialization.Serializable

/** Bentuk error generik yang dipakai hampir semua endpoint backend Next.js (lihat
 * `shared/errors/app-error.ts` -> `toErrorResponse()` di web): body non-2xx berisi
 * `{error: pesan yang aman ditampilkan ke user, code: ErrorCode SNAKE_CASE machine-readable}`.
 * BEDA dari `ChatResponseDto` (khusus /api/chat, bentuknya {role, content, errorCode}) -
 * jangan disatukan, dua kontrak endpoint yang sengaja berbeda bentuk. */
@Serializable
data class ApiErrorDto(
    val error: String = "",
    val code: String? = null,
)
