package com.sahamlens.app.aicopilot

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.theme.SahamLensTheme
import kotlinx.coroutines.launch

/**
 * AI Council layar penuh. Pesan pertama SELALU sapaan proaktif nyata (Portfolio+Market),
 * dan setiap giliran berikutnya benar-benar memanggil POST /api/chat (AiCopilotViewModel) -
 * bukan lagi gema lokal.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiCopilotScreen(modifier: Modifier = Modifier) {
    val viewModel: AiCopilotViewModel = viewModel(
        factory = AiCopilotViewModel.factory(AppGraph.chatRepository, AppGraph.portfolioRepository, AppGraph.marketRepository),
    )
    val uiState by viewModel.uiState.collectAsState()
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) listState.animateScrollToItem(uiState.messages.size - 1)
    }

    Scaffold(
        modifier = modifier,
        topBar = { TopAppBar(title = { Text("AI Council") }) },
        bottomBar = {
            ChatInputBar(
                value = input,
                enabled = !uiState.isSending,
                onValueChange = { input = it },
                onSend = {
                    if (input.isNotBlank()) {
                        val question = input
                        input = ""
                        scope.launch { viewModel.send(question) }
                    }
                },
            )
        },
    ) { innerPadding ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = 12.dp),
        ) {
            if (uiState.isGreetingLoading) {
                item { TypingIndicator() }
            } else {
                items(uiState.messages) { message -> ChatBubble(message) }
                if (uiState.isSending) item { TypingIndicator() }
            }
        }
    }
}

@Composable
private fun ChatBubble(message: ChatMessage) {
    val isAi = message.sender == MessageSender.AI
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isAi) Arrangement.Start else Arrangement.End,
    ) {
        SahamCard(
            variant = if (isAi) SahamCardVariant.Filled else SahamCardVariant.Elevated,
            modifier = Modifier.fillMaxWidth(0.82f),
        ) {
            Text(message.text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun TypingIndicator() {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Start) {
        SahamCard(variant = SahamCardVariant.Filled) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
                Text(
                    "Council AI sedang menganalisis...",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun ChatInputBar(value: String, enabled: Boolean, onValueChange: (String) -> Unit, onSend: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            placeholder = { Text("Tanya AI Council...") },
            singleLine = true,
            enabled = enabled,
        )
        IconButton(onClick = onSend, enabled = enabled) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = "Kirim", tint = MaterialTheme.colorScheme.tertiary)
            }
        }
    }
}
