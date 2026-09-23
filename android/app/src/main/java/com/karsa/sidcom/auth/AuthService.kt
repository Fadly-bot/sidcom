package com.karsa.sidcom.auth

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

data class LoginRequest(
    val email: String,
    val passwordHash: String
)

data class LoginResponse(
    val token: String,
    val userId: String
)

interface AuthService {
    @POST("/api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>
}
