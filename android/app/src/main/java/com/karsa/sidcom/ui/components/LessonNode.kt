package com.karsa.sidcom.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun LessonNode(
    title: String,
    state: String,
    score: Int?,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth().padding(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = when (state) {
                "LOCKED" -> MaterialTheme.colorScheme.surfaceVariant
                "AVAILABLE" -> MaterialTheme.colorScheme.primaryContainer
                "COMPLETED" -> MaterialTheme.colorScheme.secondaryContainer
                "MASTERED" -> MaterialTheme.colorScheme.tertiaryContainer
                else -> MaterialTheme.colorScheme.surface
            }
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(4.dp))
            
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Status: $state", style = MaterialTheme.typography.bodyMedium)
                Spacer(modifier = Modifier.width(16.dp))
                if (score != null) {
                    Text("Skor: $score%", style = MaterialTheme.typography.bodyMedium)
                }
            }
            
            if (state == "COMPLETED") {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Butuh 1 hari untuk membuka ujian Mastery (Day N+1).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer
                )
            }
        }
    }
}
