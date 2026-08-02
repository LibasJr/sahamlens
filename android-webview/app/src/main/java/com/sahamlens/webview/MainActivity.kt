package com.sahamlens.webview

import android.annotation.SuppressLint
import android.content.Intent
import android.net.ConnectivityManager
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.OnBackPressedCallback
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

// WebView wrapper murni untuk https://sahamlens.vercel.app - BUKAN pengganti app native
// di folder sahamlens-android (yang punya UI Compose sendiri). Ini shell tipis supaya
// web app yang sudah ada bisa dipasang sebagai APK tanpa menulis ulang UI-nya.
//
// BUG FIX: BASE_URL sebelumnya "/" (root) - itu me-render components/Dashboard.tsx,
// halaman landing/preview PUBLIK yang SENGAJA tidak punya Sidebar sama sekali (lihat
// app/page.tsx). Akibatnya "menu akun" di app WebView tidak pernah muncul apa pun status
// login-nya, dan pull-to-refresh ikut aneh karena halaman ini scroll di level window,
// beda dari halaman ber-Sidebar (mis. /home) yang scroll di dalam div - lihat komentar
// SCROLL_TRACKER_JS di bawah, script itu didesain untuk pola scroll-dalam-div itu.
// "/home" adalah shell aplikasi sesungguhnya (Sidebar + menu akun selalu ada kalau
// sudah login, dan halamannya sendiri bisa dibuka tanpa login juga).
private const val BASE_URL = "https://sahamlens.vercel.app/home"
private const val BASE_HOST = "sahamlens.vercel.app"

// Kebanyakan halaman dashboard app ini scroll di DALAM sebuah div (mis. "overflow-y-auto"
// di bawah Sidebar tetap), BUKAN scroll dokumen/window level - jadi webView.scrollY (posisi
// scroll window) selalu 0 walau kontennya sudah di-scroll jauh ke bawah. Jembatan JS ini
// mendengarkan event scroll di FASE CAPTURE pada `document` (scroll TIDAK bubble secara
// default, tapi capture-phase listener tetap menangkapnya dari elemen turunan manapun),
// lalu melaporkan status "di paling atas atau tidak" ke Android lewat JavascriptInterface.
class ScrollStateBridge {
    @Volatile
    var isAtTop: Boolean = true
        private set

    @JavascriptInterface
    fun report(atTop: Boolean) {
        isAtTop = atTop
    }
}

private const val SCROLL_TRACKER_JS = """
(function() {
  if (window.__sahamlensScrollTrackerInstalled) return;
  window.__sahamlensScrollTrackerInstalled = true;
  function report(target) {
    if (!window.AndroidScrollBridge) return;
    var scrollTop = (target === document) ? (window.scrollY || document.documentElement.scrollTop || 0) : (target.scrollTop || 0);
    window.AndroidScrollBridge.report(scrollTop <= 0);
  }
  document.addEventListener('scroll', function(e) { report(e.target); }, true);
  report(document);
})();
"""

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: android.widget.LinearLayout
    private val scrollBridge = ScrollStateBridge()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        swipeRefresh = findViewById(R.id.swipeRefresh)
        progressBar = findViewById(R.id.progressBar)
        offlineView = findViewById(R.id.offlineView)
        val retryButton: Button = findViewById(R.id.retryButton)

        setupWebView()

        // Refresh cuma boleh terpicu kalau konten yang sedang tampil (window ATAU div
        // internal yang scroll) benar-benar di posisi paling atas - lihat ScrollStateBridge.
        swipeRefresh.setOnChildScrollUpCallback { _, _ -> !scrollBridge.isAtTop }
        swipeRefresh.setOnRefreshListener { webView.reload() }
        retryButton.setOnClickListener { loadHomeIfOnline() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        loadHomeIfOnline()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.setSupportZoom(false)
        settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        settings.mediaPlaybackRequiresUserGesture = false

        // Login SahamLens pakai cookie session (lihat middleware.ts di web app) - wajib
        // diaktifkan supaya sesi tersimpan antar buka-tutup app, bukan cuma per-tab.
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(scrollBridge, "AndroidScrollBridge")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress in 1..99) android.view.View.VISIBLE else android.view.View.GONE
            }
        }

        webView.webViewClient = object : WebViewClient() {
            // Link ke domain lain (mis. wa.me untuk upgrade Pro, atau tautan eksternal
            // lain) dibuka di browser/app eksternal - hanya domain sendiri yang dimuat
            // di dalam WebView.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.host == BASE_HOST) return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (e: Exception) {
                    false
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                swipeRefresh.isRefreshing = false
                offlineView.visibility = android.view.View.GONE
                // Next.js pakai client-side routing (Link/router.push tidak memicu
                // onPageFinished lagi), tapi listener ini terpasang di `document` yang
                // tidak pernah diganti antar navigasi SPA, jadi cukup sekali pasang di
                // sini dan tetap berfungsi untuk semua halaman berikutnya di dalam app.
                view?.evaluateJavascript(SCROLL_TRACKER_JS, null)
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    swipeRefresh.isRefreshing = false
                    offlineView.visibility = android.view.View.VISIBLE
                }
            }
        }
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun loadHomeIfOnline() {
        if (isOnline()) {
            offlineView.visibility = android.view.View.GONE
            webView.loadUrl(BASE_URL)
        } else {
            offlineView.visibility = android.view.View.VISIBLE
        }
    }

}
