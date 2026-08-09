package com.sahamlens.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.sahamlens.app.data.AppGraph
import com.sahamlens.app.login.LoginScreen
import com.sahamlens.app.navigation.SahamAppScaffold

/**
 * Build 007 (lanjutan) - gerbang autentikasi. Ini yang membuat sesi login benar-benar
 * "tersambung ke backend": [AppGraph.authRepository.isLoggedIn] dicek sekali saat app dibuka
 * (null = masih dicek, splash singkat), lalu UI mengikuti secara reaktif - login di
 * [LoginScreen] atau logout dari Profil sama-sama cukup mengubah state itu, root ini pindah
 * tampilan sendiri tanpa navigasi manual.
 */
@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
fun SahamLensRoot(windowSizeClass: WindowSizeClass) {
    val isLoggedIn by AppGraph.authRepository.isLoggedIn.collectAsState()

    LaunchedEffect(Unit) {
        AppGraph.authRepository.checkSession()
    }

    when (isLoggedIn) {
        null -> Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            CircularProgressIndicator()
        }

        false -> LoginScreen()

        true -> {
            val navController = rememberNavController()
            SahamAppScaffold(
                navController = navController,
                windowSizeClass = windowSizeClass,
            )
        }
    }
}
