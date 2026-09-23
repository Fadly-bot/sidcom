package com.karsa.sidcom.ui.review

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ReviewSessionScreen(
    totalCards: Int,
    onComplete: () -> Unit
) {
    var currentIndex by remember { mutableStateOf(0) }
    
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Sesi Ulasan (SRS)", style = MaterialTheme.typography.titleLarge)
        Spacer(modifier = Modifier.height(16.dp))
        
        LinearProgressIndicator(progress = { currentIndex.toFloat() / totalCards })
        Spacer(modifier = Modifier.height(8.dp))
        Text("Kartu ${currentIndex + 1} dari $totalCards")
        
        Spacer(modifier = Modifier.weight(1f))
        
        Card(modifier = Modifier.fillMaxWidth().height(200.dp)) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                Text("Pertanyaan Review / Skenario Mini")
            }
        }
        
        Spacer(modifier = Modifier.weight(1f))
        
        Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
            Button(onClick = { 
                if (currentIndex < totalCards - 1) currentIndex++ else onComplete() 
            }) {
                Text("Ingat")
            }
            OutlinedButton(onClick = { 
                if (currentIndex < totalCards - 1) currentIndex++ else onComplete() 
            }) {
                Text("Lupa")
            }
        }
    }
}
