package com.sahamlens.app.aicopilot

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.sahamlens.app.data.chat.ChatRepository
import com.sahamlens.app.data.market.MarketRepository
import com.sahamlens.app.data.portfolio.PortfolioRepository
import com.sahamlens.core.network.model.ChatHistoryTurnDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AiCopilotUiState(
    val messages: List<ChatMessage> = emptyList(),
    val isSending: Boolean = false,
    val isGreetingLoading: Boolean = true,
)

private const val MAX_HISTORY_TURNS = 8

/**
 * AI Copilot ("AI Council") - sapaan pertama dirangkai dari Portfolio+Market REAL (bukan
 * SampleHomeUiState), lalu tiap giliran berikutnya benar-benar memanggil POST /api/chat
 * (sama seperti web) dengan riwayat percakapan disertakan - server tidak menyimpan sesi chat.
 */
class AiCopilotViewModel(
    private val chatRepository: ChatRepository,
    private val portfolioRepository: PortfolioRepository,
    private val marketRepository: MarketRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AiCopilotUiState())
    val uiState: StateFlow<AiCopilotUiState> = _uiState.asStateFlow()

    init {
        loadGreeting()
    }

    private fun loadGreeting() {
        viewModelScope.launch {
            val picks = marketRepository.getDailyPicks().getOrNull()
            val portfolio = portfolioRepository.getSummary().getOrNull()

            val greeting = buildString {
                append("Halo. ")
                if (portfolio != null && portfolio.holdings.isNotEmpty()) {
                    append("Anda punya ${portfolio.holdings.size} posisi terbuka. ")
                }
                if (picks != null) {
                    append("Hari ini saya menemukan ${picks.attractive.count} saham menarik, ${picks.breakout.count} breakout, dan ${picks.risky.count} berisiko. ")
                }
                append("Tanya apa saja tentang saham yang Anda minati.")
            }

            _uiState.update {
                it.copy(
                    isGreetingLoading = false,
                    messages = listOf(ChatMessage(MessageSender.AI, greeting)),
                )
            }
        }
    }

    fun send(question: String) {
        if (question.isBlank()) return
        viewModelScope.launch {
            val history = _uiState.value.messages.takeLast(MAX_HISTORY_TURNS).map {
                ChatHistoryTurnDto(role = if (it.sender == MessageSender.USER) "user" else "assistant", content = it.text)
            }
            _uiState.update { it.copy(messages = it.messages + ChatMessage(MessageSender.USER, question), isSending = true) }

            val result = chatRepository.send(prompt = question, context = "Pengguna sedang di AI Copilot, tidak melihat saham tertentu.", history = history)
            val reply = result.getOrNull() ?: "Maaf, Council AI sedang mengalami gangguan koneksi. Silakan ulangi pertanyaan Anda."

            _uiState.update { it.copy(messages = it.messages + ChatMessage(MessageSender.AI, reply), isSending = false) }
        }
    }

    companion object {
        fun factory(chatRepository: ChatRepository, portfolioRepository: PortfolioRepository, marketRepository: MarketRepository) = viewModelFactory {
            initializer { AiCopilotViewModel(chatRepository, portfolioRepository, marketRepository) }
        }
    }
}
