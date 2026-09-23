package com.karsa.sidcom.network

import retrofit2.Response
import retrofit2.http.GET

data class DashboardResponse(
    val streak: Int,
    val totalXp: Int,
    val reviewDebtTier: String, // E.g., TIER_1_SOFT_REMINDER, TIER_2_PRIORITIZED_GATE, TIER_3_HARD_LOCK
    val availableLessonNode: String?,
    val pendingReviewCards: Int
)

interface DashboardService {
    @GET("/api/v1/me/dashboard")
    suspend fun getDashboard(): Response<DashboardResponse>
}
