package com.sahamlens.core.network

import com.sahamlens.core.network.model.ApiErrorDto
import kotlinx.serialization.decodeFromString
import retrofit2.Response

/**
 * Parse body error `{error, code}` generik backend (lihat [ApiErrorDto]) dari response
 * non-2xx. Dipakai bareng endpoint yang tipe kembaliannya `Response<T>` (bukan `T` langsung)
 * SUPAYA body error itu tidak hilang - Retrofit melempar HttpException dan membuang body
 * untuk tipe kembalian biasa (lihat catatan yang sama di [SahamLensApi.chat]/ChatRepository
 * untuk kasus serupa dengan bentuk body berbeda). Null kalau body kosong atau bukan JSON
 * yang cocok (mis. halaman HTML dari proxy/gateway timeout, bukan error dari app kita).
 */
fun <T> Response<T>.parseApiError(): ApiErrorDto? =
    errorBody()?.string()?.let { raw -> runCatching { NetworkModule.json.decodeFromString<ApiErrorDto>(raw) }.getOrNull() }
