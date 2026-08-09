package com.sahamlens.app.aicopilot

enum class MessageSender { AI, USER }

data class ChatMessage(val sender: MessageSender, val text: String)
