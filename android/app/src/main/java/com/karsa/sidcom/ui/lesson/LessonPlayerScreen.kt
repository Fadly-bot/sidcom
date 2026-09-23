package com.karsa.sidcom.ui.lesson

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun LessonPlayerScreen(
    lessonTitle: String,
    onAudioRecordStart: () -> Unit,
    onAudioRecordStop: () -> Unit,
    onTextFallback: () -> Unit,
    onSubmit: () -> Unit
) {
    var isRecording by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Pelajaran: $lessonTitle", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(32.dp))
        
        Text("Track A: Latihan Vokal", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(16.dp))
        
        Button(onClick = { 
            isRecording = !isRecording
            if (isRecording) onAudioRecordStart() else onAudioRecordStop()
        }) {
            Text(if (isRecording) "Stop Rekaman" else "Mulai Rekaman Suara")
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        TextButton(onClick = onTextFallback) {
            Text("Mode Tulisan (Universal Fallback)")
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        Button(onClick = onSubmit, modifier = Modifier.fillMaxWidth()) {
            Text("Selesaikan Pelajaran & Sync")
        }
    }
}
