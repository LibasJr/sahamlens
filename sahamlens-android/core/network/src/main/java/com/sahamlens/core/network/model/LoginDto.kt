package com.sahamlens.core.network.model

import kotlinx.serialization.Serializable

/** Bentuk asli POST /api/auth/login (modules/user/controller/auth.controller.ts handleLogin). */
@Serializable
data class LoginRequestDto(
    val email: String,
    val password: String,
)

@Serializable
data class LoginResponseDto(
    val success: Boolean = false,
    val role: String? = null,
)
