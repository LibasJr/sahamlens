package com.sahamlens.core.network

import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl

/**
 * CookieJar sesi login (Build 010 - "wajib memakai cookie sesi asli hasil login pengguna
 * sendiri, bukan kredensial yang ditanam" seperti APK React Native lama).
 *
 * CATATAN JUJUR: implementasi ini in-memory saja (hilang saat proses app mati) - persistensi
 * lintas-restart (DataStore/EncryptedSharedPreferences) adalah pekerjaan lanjutan yang belum
 * masuk cakupan Build 007, bukan sesuatu yang terlewat tanpa sadar.
 */
class SessionCookieJar : CookieJar {
    private val store = mutableMapOf<String, List<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        store[url.host] = cookies
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        return store[url.host].orEmpty()
    }

    /** Dipanggil saat logout - sesi lama tidak boleh ikut terpakai di request berikutnya. */
    fun clear() {
        store.clear()
    }
}
