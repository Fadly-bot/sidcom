package com.karsa.sidcom.auth

import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject

class AuthInterceptor @Inject constructor(
    private val tokenManager: TokenManager
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val requestBuilder = chain.request().newBuilder()
        tokenManager.getToken()?.let {
            requestBuilder.addHeader("Authorization", "Bearer $it")
        }
        val response = chain.proceed(requestBuilder.build())
        
        // Handle 401 Unauthorized explicitly if needed
        if (response.code == 401) {
            tokenManager.clearToken()
            // In a real implementation, we'd trigger an event to log the user out via UI
        }
        
        return response
    }
}
