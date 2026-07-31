package com.sahamlens.app.aicopilot

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sahamlens.app.home.SampleHomeUiState
import com.sahamlens.core.designsystem.component.SahamCard
import com.sahamlens.core.designsystem.component.SahamCardVariant
import com.sahamlens.core.designsystem.theme.SahamLensTheme
import kotlinx.coroutines.launch

/**
 * Build 005 - AI Copilot layar penuh. Pesan pertama SELALU sapaan proaktif (bukan layar
 * kosong menunggu pertanyaan) - AI bicara duluan, baru siap didalami lewat chat.
 * CATATAN JUJUR: balasan setelah pesan pertama masih gema lokal - integrasi Gemini nyata
 * (pola yang sama dengan /api/ai-briefing di web) menyusul saat lapisan jaringan terpasang.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiCopilotScreen(modifier: Modifier = Modifier) {
    val messages = remember {
        mutableStateOf(
            listOf(
                ChatMessage(MessageSender.AI, proactiveGreeting(SampleHomeUiState, "Selamat sore")),
            ),
        )
    }
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()

    LaunchedEffect(messages.value.size) {
        if (messages.value.isNotEmpty()) listState.animateScrollToItem(messages.value.size - 1)
    }

    Scaffold(
        modifier = modifier,
        topBar = { TopAppBar(title = { Text("AI Council") }) },
        bottomBar = {
            ChatInputBar(
                value = input,
                onValueChange = { input = it },
                onSend = {
                    if (input.isNotBlank()) {
                        val question = input
                        messages.value = messages.value + ChatMessage(MessageSender.USER, question)
                        input = ""
                        scope.launch {
                            messages.value = messages.value + ChatMessage(
                                MessageSender.AI,
                                "AI Council belum tersambung ke model AI sungguhan di build ini - " +
                                    "saya sengaja tidak mengarang jawaban untuk \"$question\". " +
                                    "Integrasi nyata (Gemini, pola yang sama dengan /api/council di web) menyusul.",
                            )
                        }
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
            items(messages.value) { message -> ChatBubble(message) }
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
private fun ChatInputBar(value: String, onValueChange: (String) -> Unit, onSend: () -> Unit) {
    val extra = SahamLensTheme.extraColors
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
        )
        IconButton(onClick = onSend) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = "Kirim", tint = MaterialTheme.colorScheme.tertiary)
            }
        }
    }
}
