# Error Learning Log — SahamLens Android

## [2026-07-31] - Aplikasi tidak pernah tersambung ke backend (tidak ada layar Login)
- Stack: Kotlin / Jetpack Compose / Retrofit / OkHttp
- File baru: `login/LoginScreen.kt`, `login/LoginViewModel.kt`, `data/auth/AuthRepository.kt`,
  `SahamLensRoot.kt`; diubah: `MainActivity.kt`, `ProfileScreen.kt`, `SahamLensApi.kt`,
  `SessionCookieJar.kt`, `AppGraph.kt`
- Gejala: `SessionCookieJar` selalu kosong sejak app dipasang - tidak ada jalur UI untuk login,
  jadi setiap panggilan API yang butuh sesi (Watchlist, dst.) pasti 401 selamanya. Profil juga
  menampilkan nama/email contoh yang ditulis tetap di kode ("Unison"), bukan data akun asli.
- Root Cause: Build 007 fokus membangun POLA cache-first (Watchlist) tapi melewatkan prasyaratnya
  sendiri - tidak ada cara mendapatkan cookie sesi sama sekali.
- Fix: Tambah `POST /api/auth/login` & `POST /api/auth/logout` ke `SahamLensApi`, `AuthRepository`
  dengan `StateFlow<Boolean?> isLoggedIn` yang diamati root navigasi secara reaktif (null=cek,
  false=layar Login, true=app utama) - login/logout dari mana pun otomatis memindahkan tampilan
  tanpa navigasi manual. `okhttp3.CookieJar` di `:core:network` harus `api` (bukan
  `implementation`) karena jadi supertype publik yang disentuh `:app`.
- Cegah: Kalau membangun lapisan data yang butuh sesi (cache-first, dsb.), verifikasi dulu ADA
  jalur nyata untuk mengisi sesi itu - jangan asumsikan "nanti juga ada yang login".

## [2026-07-31] - Baris/kartu tidak bisa diklik (dead-end navigation)
- Stack: Kotlin / Jetpack Compose
- File: `app/src/main/java/com/sahamlens/app/home/HomeScreen.kt` (WatchlistCompact),
  `app/src/main/java/com/sahamlens/app/watchlist/WatchlistScreen.kt` (WatchlistRowCard)
- Gejala: Baris Watchlist di Home dan di tab Watchlist menerima parameter `onStockClick` tapi
  `Row`/`SahamCard` pembungkusnya tidak punya `Modifier.clickable{}` — tampak seperti tombol
  tapi tidak merespons ketukan sama sekali.
- Root Cause: Callback dideklarasikan di signature function tapi lupa benar-benar disambungkan
  ke modifier komponen visualnya. Compose tidak memberi warning kompilasi untuk ini karena
  parameter tetap "dipakai" (diteruskan ke fungsi lain), jadi lolos dari deteksi unused-param.
- Fix: Tambah `.clickable { onStockClick(item.symbol) }` pada Row/Card yang relevan.
- Cegah: Setiap kali menambah parameter `onXxxClick` ke composable, cek baris berikutnya --
  apakah benar-benar dipasang ke `Modifier.clickable`, bukan cuma diterima lalu dioper lagi ke
  child tanpa pernah dipasang di ujungnya.

## [2026-07-31] - Layar bertumpuk (stack) tanpa tombol kembali
- Stack: Kotlin / Jetpack Compose / Navigation Compose
- File: `StockDetailScreen.kt`, `DesignSystemShowcaseScreen.kt`
- Gejala: Layar yang dicapai lewat `navController.navigate(...)` (bukan tab Bottom Nav) tidak
  punya `navigationIcon` di TopAppBar — parameter `onBack` ada di signature tapi tidak pernah
  dipakai di UI, pengguna cuma bisa kembali lewat gesture/back sistem.
- Root Cause: TopAppBar dibuat minimal saat pertama kali (fokus ke layout inti) dan tombol
  kembali eksplisit terlewat ditambahkan.
- Fix: `TopAppBar(navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, ...) } })`.
- Cegah: Setiap layar yang dicapai via `navController.navigate()` (bukan tujuan Bottom Nav)
  WAJIB py tombol kembali eksplisit di TopAppBar - jangan andalkan gesture sistem saja.

## [2026-07-31] - Efek samping di dalam kalkulasi derivedStateOf
- Stack: Kotlin / Jetpack Compose
- File: `app/src/main/java/com/sahamlens/app/navigation/SahamScaffold.kt`
- Gejala: FAB "Tanya AI" collapse/extend berbasis `derivedStateOf` yang MENULIS state
  eksternal (`previousIndex`/`previousOffset`) di dalam blok kalkulasinya sendiri - anti-pattern
  resmi yang didokumentasikan tim Compose (kalkulasi seharusnya fungsi murni dari state yang
  dibaca, bisa dipanggil ulang tanpa "commit" oleh sistem snapshot).
- Root Cause: Meniru pola populer dari tutorial lama tanpa memverifikasi apakah masih
  direkomendasikan.
- Fix: Sederhanakan jadi `derivedStateOf` murni: `firstVisibleItemIndex == 0 && firstVisibleItemScrollOffset < 40`
  (extended hanya dekat puncak), tanpa menulis state lain di dalam blok kalkulasi.
- Cegah: `derivedStateOf { }` isinya HARUS murni membaca State, tidak boleh ada `var x = ...`
  assignment ke mutableState lain di dalamnya.

## [2026-07-31] - Fitur "AI bicara duluan" (Build 005) tidak ada pintu masuk dari Home
- Stack: Kotlin / Jetpack Compose
- File: `HomeScreen.kt` (AiOpportunityBanner), `SahamNavHost.kt`, `SahamScaffold.kt`
- Gejala: Kartu AI Opportunity di Home cuma teks statis, tidak bisa diketuk untuk membuka AI
  Copilot - padahal itu skenario inti Build 005 di blueprint sendiri.
- Root Cause: Saat Build 003 (Home) dikerjakan, navigasi lintas-tab ke AI belum tersedia dari
  dalam NavHost (logika `navigateToTab` cuma ada di level Scaffold), jadi kartunya dibuat pasif
  dulu dan terlewat disambungkan belakangan.
- Fix: Thread `onNavigateToTab: (SahamDestination) -> Unit` dari `SahamAppScaffold.navigateToTab`
  turun ke `SahamNavHost`, dipakai `HomeScreen`'s `onOpenAiCopilot` agar konsisten dengan
  semantik Bottom Nav (popUpTo/launchSingleTop/restoreState), bukan `navController.navigate()`
  polos yang bisa menumpuk back-stack.
- Cegah: Kalau ada aksi cross-tab dari dalam sebuah tab (bukan lewat Bottom Nav langsung),
  pastikan lewat fungsi navigasi tab yang sama, jangan `navigate()` mentah.

## [2026-08-14] - AI Council: semua error non-2xx dari /api/chat ditampilkan sebagai satu pesan generik palsu
- Stack: Kotlin / Retrofit / kotlinx.serialization
- File: `core/network/SahamLensApi.kt`, `core/network/build.gradle.kts`,
  `app/.../data/chat/ChatRepository.kt`
- Gejala: Server `/api/chat` SENGAJA membalas body `{role, content, errorCode}` yang valid
  bahkan di status non-2xx (400 prompt kosong, 429 rate limit / kuota tamu habis, 503 provider
  AI belum terkonfigurasi, 504 timeout) — `content`-nya adalah pesan aman & spesifik yang
  MEMANG dimaksud tampil ke pengguna (mis. "Jatah pertanyaan LensAI untuk pengunjung sudah
  habis. Silakan masuk..."). Client Android memanggil `api.chat()` dengan tipe kembalian
  `ChatResponseDto` langsung (bukan `Response<T>`), jadi Retrofit melempar `HttpException`
  untuk status non-2xx dan body itu HILANG — user selalu melihat satu pesan generik
  ("Maaf, Council AI sedang mengalami gangguan koneksi...") apa pun penyebab errornya,
  padahal web (`components/AIChat.tsx`) sudah lama membaca `data.content` itu secara eksplisit
  dengan komentar tegas: "jangan membuang content itu atau menyamakan semua kegagalan menjadi
  satu pesan palsu".
- Root Cause: Pola default Retrofit (tipe kembalian bukan `Response<T>`) dipakai tanpa sadar
  bahwa endpoint ini beda dari endpoint lain di app — endpoint lain (401/402) memang cukup
  dibedakan lewat kode status saja (pesannya statis di client), tapi `/api/chat` sengaja
  menaruh pesan dinamis di body meski status-nya gagal.
- Fix: `SahamLensApi.chat()` → `Response<ChatResponseDto>`. `ChatRepository.send()` baca
  `response.body()` kalau sukses, atau parse `response.errorBody()?.string()` manual jadi
  `ChatResponseDto` kalau gagal, lalu pakai `.content`-nya di kedua jalur — fallback generik
  cuma dipakai kalau body benar-benar kosong/tidak bisa di-parse (IOException/no connectivity,
  sama seperti `catch(e)` di web). `core/network` deps: `kotlinx.serialization.json` diubah
  dari `implementation` ke `api` supaya `Json.decodeFromString<T>` terlihat dari `:app`.
- Cegah: Sebelum menganggap "cukup cek HTTP status code" cukup untuk sebuah endpoint, cek dulu
  apakah body error-nya membawa pesan dinamis yang dimaksud tampil ke user (bandingkan dengan
  perilaku client web yang sudah ada) — kalau iya, tipe kembalian Retrofit-nya WAJIB
  `Response<T>`, bukan `T` langsung.

## Catatan lain (tidak perlu fix, didokumentasikan sebagai batasan yang disengaja)
- ~~Watchlist tab akan selalu menampilkan error "Sesi berakhir"~~ — SUDAH DIPERBAIKI (lihat entri
  "Aplikasi tidak pernah tersambung ke backend" di atas). Login sekarang tersedia dan mengisi
  sesi asli.
- ~~AI Council masih menjawab dengan gema lokal jujur~~ — SUDAH TIDAK BERLAKU: `AiCopilotViewModel`
  + `ChatRepository` sudah memanggil `POST /api/chat` asli sejak Build 007 (sama seperti web),
  bukan echo lokal lagi. Yang tersisa dari catatan lama ini cuma bug penanganan error non-2xx,
  lihat entri di atas ([2026-08-14]).
- Sesi login masih in-memory (`SessionCookieJar` tidak persisten lintas-restart app) - buka app
  lagi setelah dipaksa berhenti akan kembali ke layar Login. Persistensi (DataStore) adalah
  pekerjaan lanjutan.
