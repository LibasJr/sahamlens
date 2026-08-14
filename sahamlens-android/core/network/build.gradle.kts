plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.sahamlens.core.network"
    compileSdk = 34

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // api (bukan implementation) - ChatRepository di :app perlu Json.decodeFromString<T>
    // sendiri untuk mem-parse errorBody() manual (lihat SahamLensApi.chat / ChatRepository),
    // jadi runtime kotlinx-serialization harus terlihat transitif. Modul :app tidak perlu
    // plugin kotlin.serialization sendiri karena tidak mendeklarasikan @Serializable baru,
    // cuma memakai serializer yang sudah dihasilkan di sini.
    api(libs.kotlinx.serialization.json)
    // api (bukan implementation) - HttpException dipakai pemanggil (mis. StockDetailViewModel
    // di :app) untuk membedakan 401/402/kegagalan jaringan biasa, jadi harus terlihat transitif.
    api(libs.retrofit.core)
    implementation(libs.retrofit.kotlinx.serialization)
    // api (bukan implementation) - CookieJar adalah supertype publik SessionCookieJar,
    // modul yang menyimpan referensi ke SessionCookieJar (mis. :app) perlu melihatnya juga.
    api(libs.okhttp.core)
    implementation(libs.okhttp.logging)
}
