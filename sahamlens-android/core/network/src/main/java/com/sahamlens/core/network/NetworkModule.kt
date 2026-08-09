package com.sahamlens.core.network

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Build 007 - titik bangun tunggal untuk klien jaringan, menunjuk ke deployment produksi
 * SahamLens yang sebenarnya. Object singleton manual (bukan Hilt) - DI penuh menyusul di
 * Build 010, supaya modul ini bisa dipakai tanpa harus menunggu graph DI selesai.
 */
object NetworkModule {
    private const val BASE_URL = "https://sahamlens.vercel.app/"

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    val sessionCookieJar = SessionCookieJar()

    private val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .cookieJar(sessionCookieJar)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                },
            )
            .build()
    }

    private val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
    }

    val api: SahamLensApi by lazy { retrofit.create(SahamLensApi::class.java) }
}
