package com.sahamlens.app.profile

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
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Password
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.sahamlens.app.data.AppGraph
import com.sahamlens.core.designsystem.component.SahamBadge
import com.sahamlens.core.designsystem.component.SahamBadgeVariant
import kotlinx.coroutines.launch

private data class ProfileMenuItem(val label: String, val icon: ImageVector, val onClick: () -> Unit)

/**
 * Build 002 - "More/Settings" bersarang di dalam Profil, bukan tujuan Bottom Nav ke-7.
 * Build 007 (lanjutan) - email & role diambil dari [AppGraph.authRepository] (sesi asli hasil
 * login), bukan teks contoh yang ditulis tetap di kode.
 */
@Composable
fun ProfileScreen(
    modifier: Modifier = Modifier,
    onOpenDesignSystemShowcase: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    val email by AppGraph.authRepository.userEmail.collectAsState()
    val role by AppGraph.authRepository.userRole.collectAsState()

    val menu = listOf(
        ProfileMenuItem("Design System Showcase", Icons.Outlined.Palette, onOpenDesignSystemShowcase),
        ProfileMenuItem("Ubah Password", Icons.Outlined.Password) {},
        ProfileMenuItem("Notifikasi", Icons.Outlined.Notifications) {},
        ProfileMenuItem("Tentang SahamLens", Icons.Outlined.Info) {},
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
}
