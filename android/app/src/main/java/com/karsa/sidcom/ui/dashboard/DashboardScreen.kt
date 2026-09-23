package com.karsa.sidcom.ui.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun DashboardScreen(
    streak: Int,
    totalXp: Int,
    reviewDebtTier: String,
    onStartLesson: () -> Unit,
    onStartReview: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Beranda (Dashboard)", style = MaterialTheme.typography.headlineMedium)
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text("Streak: $streak hari", style = MaterialTheme.typography.titleMedium)
            Text("XP: $totalXp", style = MaterialTheme.typography.titleMedium)
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Debt Tier Gate Logic
        when (reviewDebtTier) {
            "TIER_3_HARD_LOCK" -> {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Kurangi Beban Review", color = MaterialTheme.colorScheme.onErrorContainer)
                        Text("Selesaikan minimal 1 sesi review (5-8 kartu) untuk membuka pelajaran baru.")
                        Button(onClick = onStartReview) {
                            Text("Mulai Review")
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = { }, enabled = false, modifier = Modifier.fillMaxWidth()) {
                    Text("Pelajaran Terkunci (Selesaikan Review Dulu)")
                }
            }
            "TIER_2_PRIORITIZED_GATE" -> {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Rekomendasi: Review Dulu", color = MaterialTheme.colorScheme.onPrimaryContainer)
                        Button(onClick = onStartReview) {
                            Text("Mulai Review")
                        }
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = onStartLesson, modifier = Modifier.fillMaxWidth()) {
                    Text("Lanjutkan ke Pelajaran")
                }
            }
            else -> { // TIER_1_SOFT_REMINDER or NONE
                Button(onClick = onStartLesson, modifier = Modifier.fillMaxWidth()) {
                    Text("Mulai Pelajaran Harian")
                }
                if (reviewDebtTier == "TIER_1_SOFT_REMINDER") {
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(onClick = onStartReview) {
                        Text("Ada beberapa kartu untuk di-review")
                    }
                }
            }
        }
    }
}
