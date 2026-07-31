package com.sahamlens.webview

import android.annotation.SuppressLint
import android.content.Intent
import android.net.ConnectivityManager
import android.os.Bundle
import android.webkit.CookieManager
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
private const val BASE_URL = "https://sahamlens.vercel.app/"
private const val BASE_HOST = "sahamlens.vercel.app"

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar
    private lateinit var offlineView: android.widget.LinearLayout

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

        // Tanpa ini, SwipeRefreshLayout memicu refresh di posisi scroll manapun di dalam
        // halaman (bukan cuma waktu benar-benar di paling atas) karena WebView tidak
        // otomatis melaporkan posisi scroll-nya sendiri ke parent view. Refresh cuma
        // boleh terpicu kalau webView.scrollY == 0 (halaman benar-benar di atas).
        swipeRefresh.setOnChildScrollUpCallback { _, _ -> webView.scrollY > 0 }
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
