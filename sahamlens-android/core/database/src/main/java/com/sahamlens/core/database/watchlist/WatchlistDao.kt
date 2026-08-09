package com.sahamlens.core.database.watchlist

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface WatchlistDao {
    @Query("SELECT * FROM watchlist_cache ORDER BY symbol ASC")
    fun observeAll(): Flow<List<WatchlistCacheEntity>>

    @Upsert
    suspend fun upsertAll(items: List<WatchlistCacheEntity>)

    @Query("DELETE FROM watchlist_cache")
    suspend fun clear()

    /** Ganti seluruh isi cache secara atomik - hindari baris lama nyangkut kalau server menghapus item. */
    @Transaction
    suspend fun replaceAll(items: List<WatchlistCacheEntity>) {
        clear()
        upsertAll(items)
    }
}
