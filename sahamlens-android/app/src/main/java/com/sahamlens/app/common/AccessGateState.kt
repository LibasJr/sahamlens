package com.sahamlens.app.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.sahamlens.core.designsystem.component.SahamButton

/**
 * Layar 401/402 dipakai bersama - beberapa "Alat Analisis" (Compare, Market Pulse) butuh
 * login + akun Pro, sama seperti Detail Saham. Diekstrak supaya pesannya konsisten lintas
 * layar, bukan disalin-tempel setiap kali ada endpoint baru yang di-gate sama.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccessRequiredScreen(
    title: String,
    message: String,
    actionLabel: String?,
    onAction: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("") },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Kembali") }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (actionLabel != null) {
                Spacer(Modifier.height(16.dp))
                SahamButton(actionLabel, onClick = onAction)
            }
        }
    }
}

/** errorCode HTTP mentah -> pesan yang konsisten untuk 401 (belum login) / 402 (bukan Pro). */
fun accessErrorTitle(errorCode: Int?): String? = when (errorCode) {
    401 -> "Login untuk membuka fitur ini"
    402 -> "Fitur Pro"
    else -> null
}

fun accessErrorMessage(errorCode: Int?, featureName: String): String = when (errorCode) {
    401 -> "$featureName butuh akun untuk digunakan."
    402 -> "Upgrade ke SahamLens Pro untuk memakai $featureName."
    else -> "Terjadi kesalahan. Coba lagi."
}
