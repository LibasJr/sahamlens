package com.sahamlens.app.profile

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.Compare
import androidx.compose.material.icons.outlined.FilterAlt
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Password
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.sahamlens.app.BuildConfig
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import com.sahamlens.core.designsystem.component.SahamButton
import com.sahamlens.core.designsystem.component.SahamButtonVariant
import kotlinx.coroutines.launch

private data class ProfileMenuItem(val label: String, val icon: ImageVector, val onClick: () -> Unit)
private enum class ProfileDialog { NONE, PASSWORD, NOTIFICATIONS, ABOUT }

/**
 * Profil - "More/Settings" bersarang di sini, bukan tujuan Bottom Nav ke-7. Email & role dari
 * sesi login asli ([AppGraph.authRepository]). Ubah Password & Notifikasi belum punya layar
 * sendiri di client Android (belum ada preference API di backend) - diberi dialog jujur yang
 * mengarahkan ke web, BUKAN tombol yang diam-diam tidak melakukan apa-apa (lihat catatan di
 * error-learning: dead click handler adalah bug nyata yang pernah lolos di sesi sebelumnya).
 */
@Composable
fun ProfileScreen(
    modifier: Modifier = Modifier,
    onOpenDesignSystemShowcase: () -> Unit = {},
    onOpenRiskCalculator: () -> Unit = {},
    onOpenScreener: () -> Unit = {},
    onOpenCompare: () -> Unit = {},
    onOpenMarketPulse: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    val email by AppGraph.authRepository.userEmail.collectAsState()
    val role by AppGraph.authRepository.userRole.collectAsState()
    var dialog by remember { mutableStateOf(ProfileDialog.NONE) }

    val toolsMenu = listOf(
        ProfileMenuItem("Stock Screener", Icons.Outlined.FilterAlt, onOpenScreener),
        ProfileMenuItem("Compare Tool", Icons.Outlined.Compare, onOpenCompare),
        ProfileMenuItem("Market Pulse", Icons.Outlined.Insights, onOpenMarketPulse),
        ProfileMenuItem("Risk Calculator", Icons.Outlined.Calculate, onOpenRiskCalculator),
    )
    val menu = listOf(
        ProfileMenuItem("Design System Showcase", Icons.Outlined.Palette, onOpenDesignSystemShowcase),
        ProfileMenuItem("Ubah Password", Icons.Outlined.Password) { dialog = ProfileDialog.PASSWORD },
        ProfileMenuItem("Notifikasi", Icons.Outlined.Notifications) { dialog = ProfileDialog.NOTIFICATIONS },
        ProfileMenuItem("Tentang SahamLens", Icons.Outlined.Info) { dialog = ProfileDialog.ABOUT },
        ProfileMenuItem("Logout", Icons.AutoMirrored.Outlined.Logout) {
            scope.launch { AppGraph.authRepository.logout() }
        },
    )

    LazyColumn(modifier = modifier.fillMaxSize()) {
        item {
            Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(email?.substringBefore("@") ?: "Pengguna", style = MaterialTheme.typography.titleLarge)
                Text(
                    email ?: "-",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SahamBadge(
                    role?.uppercase() ?: "FREE",
                    variant = SahamBadgeVariant.Premium,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }
            HorizontalDivider()
        }
        item {
            Text(
                "Alat & Analisis",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            )
        }
        items(toolsMenu) { item ->
            ListItem(
                headlineContent = { Text(item.label) },
                leadingContent = { Icon(item.icon, contentDescription = null) },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = item.onClick),
            )
        }
        item { HorizontalDivider() }
        items(menu) { item ->
            ListItem(
                headlineContent = { Text(item.label) },
                leadingContent = { Icon(item.icon, contentDescription = null) },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = item.onClick),
            )
        }
    }

    when (dialog) {
        ProfileDialog.PASSWORD -> OpenWebDialog(
            title = "Ubah Password",
            message = "Ubah password belum tersedia langsung di app - buka SahamLens di browser untuk mengatur ulang password Anda.",
            path = "/forgot-password",
            onDismiss = { dialog = ProfileDialog.NONE },
        )
        ProfileDialog.NOTIFICATIONS -> AlertDialog(
            onDismissRequest = { dialog = ProfileDialog.NONE },
            title = { Text("Notifikasi") },
            text = { Text("Pengaturan notifikasi (peluang AI, target price, breakout) belum tersedia di build ini - menyusul.") },
            confirmButton = { SahamButton("OK", onClick = { dialog = ProfileDialog.NONE }, variant = SahamButtonVariant.Text) },
        )
        ProfileDialog.ABOUT -> AlertDialog(
            onDismissRequest = { dialog = ProfileDialog.NONE },
            title = { Text("Tentang SahamLens") },
            text = { Text("SahamLens ${BuildConfig.VERSION_NAME} - Analisis saham IDX berbasis AI (Council AI 10-agent), untuk edukasi, bukan saran finansial.") },
            confirmButton = { SahamButton("OK", onClick = { dialog = ProfileDialog.NONE }, variant = SahamButtonVariant.Text) },
        )
        ProfileDialog.NONE -> {}
    }
}

@Composable
private fun OpenWebDialog(title: String, message: String, path: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            SahamButton(
                "Buka di Browser",
                onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://sahamlens.vercel.app$path")))
                    onDismiss()
                },
            )
        },
        dismissButton = { SahamButton("Tutup", onClick = onDismiss, variant = SahamButtonVariant.Text) },
    )
}
