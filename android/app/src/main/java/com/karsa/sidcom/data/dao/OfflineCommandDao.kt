package com.karsa.sidcom.data.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface OfflineCommandDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCommand(command: OfflineCommandEntity)

    @Query("SELECT * FROM offline_command_queue_table WHERE status = 'PENDING' ORDER BY created_at ASC")
    suspend fun getPendingCommands(): List<OfflineCommandEntity>

    @Query("UPDATE offline_command_queue_table SET status = 'SYNCING' WHERE command_id IN (:commandIds)")
    suspend fun markAsSyncing(commandIds: List<String>)

    @Query("DELETE FROM offline_command_queue_table WHERE command_id IN (:commandIds)")
    suspend fun deleteCommands(commandIds: List<String>)
    
    @Query("UPDATE offline_command_queue_table SET status = 'FAILED', retry_count = retry_count + 1 WHERE command_id IN (:commandIds)")
    suspend fun markAsFailed(commandIds: List<String>)
}
