package com.sahamlens.core.network.model

import kotlinx.serialization.Serializable

/** Bentuk asli GET /api/auth/me (handleMe di modules/user). */
@Serializable
data class AuthMeResponse(
    val authenticated: Boolean = false,
    val user: AuthUserDto? = null,
)

@Serializable
data class AuthUserDto(
    val id: String? = null,
    val email: String? = null,
    val role: String? = null,
)
