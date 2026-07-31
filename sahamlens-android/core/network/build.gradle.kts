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
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.retrofit.core)
    implementation(libs.retrofit.kotlinx.serialization)
    // api (bukan implementation) - CookieJar adalah supertype publik SessionCookieJar,
    // modul yang menyimpan referensi ke SessionCookieJar (mis. :app) perlu melihatnya juga.
    api(libs.okhttp.core)
    implementation(libs.okhttp.logging)
}
