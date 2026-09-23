package com.karsa.sidcom.data.dao

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "offline_command_queue_table")
data class OfflineCommandEntity(
    @PrimaryKey val command_id: String, // UUIDv7
    val command_type: String,           // SUBMIT_LESSON_ATTEMPT, etc.
    val client_seq: Long,
    val installation_id: String,
    val payload_json: String,
    val status: String,                 // PENDING, SYNCING, FAILED
    val retry_count: Int,
    val created_at: Long
)
