package com.karsa.sidcom.data

import androidx.room.Database
import androidx.room.RoomDatabase
import com.karsa.sidcom.data.dao.OfflineCommandDao
import com.karsa.sidcom.data.dao.OfflineCommandEntity

@Database(entities = [OfflineCommandEntity::class], version = 1, exportSchema = false)
abstract class KarsaDatabase : RoomDatabase() {
    abstract fun offlineCommandDao(): OfflineCommandDao
}
