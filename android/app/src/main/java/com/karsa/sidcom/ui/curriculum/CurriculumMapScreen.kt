package com.karsa.sidcom.ui.curriculum

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

data class NodeState(val id: String, val title: String, val state: String) // LOCKED, AVAILABLE, COMPLETED, MASTERED, REVIEW_REQUIRED

@Composable
fun CurriculumMapScreen(
    nodes: List<NodeState>,
    onNodeClick: (NodeState) -> Unit
) {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        item {
            Text("Peta Belajar (Curriculum Path)", style = MaterialTheme.typography.headlineMedium)
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        items(nodes) { node ->
            Card(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                onClick = { if (node.state == "AVAILABLE" || node.state == "REVIEW_REQUIRED") onNodeClick(node) }
            ) {
                Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(node.title)
                    Text(node.state, color = when(node.state) {
                        "LOCKED" -> MaterialTheme.colorScheme.onSurfaceVariant
                        "AVAILABLE" -> MaterialTheme.colorScheme.primary
                        "COMPLETED" -> MaterialTheme.colorScheme.secondary
                        "MASTERED" -> MaterialTheme.colorScheme.tertiary
                        "REVIEW_REQUIRED" -> MaterialTheme.colorScheme.error
                        else -> MaterialTheme.colorScheme.onSurface
                    })
                }
            }
        }
    }
}
