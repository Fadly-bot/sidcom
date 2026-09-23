package com.karsa.sidcom.ui.review

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ReviewGateModal(
    tier: String, // TIER_2_PRIORITIZED_GATE or TIER_3_HARD_LOCK
    onDismiss: () -> Unit,
    onStartReview: () -> Unit
) {
    AlertDialog(
        onDismissRequest = { if (tier != "TIER_3_HARD_LOCK") onDismiss() },
        title = {
            Text(if (tier == "TIER_3_HARD_LOCK") "Review Dibutuhkan!" else "Rekomendasi Review")
        },
        text = {
            Text(
                if (tier == "TIER_3_HARD_LOCK") 
                    "Pelajaran baru terkunci. Selesaikan minimal 1 sesi review (5-8 kartu) untuk membuka pelajaran."
                else 
                    "Ada baiknya Anda menyelesaikan review sebelum memulai materi baru untuk memastikan retensi jangka panjang."
            )
        },
        confirmButton = {
            Button(onClick = onStartReview) {
                Text("Mulai Review")
            }
        },
        dismissButton = {
            if (tier != "TIER_3_HARD_LOCK") {
                TextButton(onClick = onDismiss) {
                    Text("Lanjutkan ke Pelajaran")
                }
            }
        }
    )
}
