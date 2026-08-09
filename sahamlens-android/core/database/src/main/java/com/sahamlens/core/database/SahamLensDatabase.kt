package com.sahamlens.core.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.sahamlens.core.database.watchlist.WatchlistCacheEntity
import com.sahamlens.core.database.watchlist.WatchlistDao

@Database(
    entities = [WatchlistCacheEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class SahamLensDatabase : RoomDatabase() {
    abstract fun watchlistDao(): WatchlistDao

    companion object {
        @Volatile private var instance: SahamLensDatabase? = null

        fun getInstance(context: Context): SahamLensDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    SahamLensDatabase::class.java,
                    "sahamlens.db",
                ).build().also { instance = it }
            }
    }
}
