package com.sahamlens.core.database.watchlist

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Build 007 - satu-satunya sumber kebenaran (single source of truth) untuk UI Watchlist.
 * [cachedAtEpochMillis] dipakai untuk label "Data X menit lalu" (Build 007 - stale-while-
 * revalidate) tanpa harus menyimpan timestamp per-baris terpisah.
 */
@Entity(tableName = "watchlist_cache")
data class WatchlistCacheEntity(
    @PrimaryKey val symbol: String,
    val buyPrice: Double?,
    val alertPrice: Double?,
    val lot: Int?,
    val cachedAtEpochMillis: Long,
)
