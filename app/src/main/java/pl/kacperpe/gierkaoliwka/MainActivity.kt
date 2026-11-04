package pl.kacperpe.gierkaoliwka

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Gra działa w WebView. Aktualizacje:
 *  1. Gra (HTML/JS) — przy starcie pobierana z najnowszego commita na main (raw.githubusercontent),
 *     więc każda zmiana w app/src/main/assets jest widoczna od razu po ponownym uruchomieniu.
 *     Offline: ostatnia pobrana wersja, a jak jej nie ma — wersja wbudowana w APK.
 *  2. APK — sprawdzanie najnowszego Release na GitHubie i propozycja aktualizacji.
 */
class MainActivity : Activity() {
    companion object {
        const val OWNER = "Kacperpe"
        const val REPO = "GierkaOliwka"
        const val WEB_PATH = "app/src/main/assets"
        const val START_TIMEOUT_MS = 3500L
    }

    private lateinit var web: WebView
    private val main = Handler(Looper.getMainLooper())
    private var loaded = false
    private var pendingApk: File? = null
    private val prefs by lazy { getSharedPreferences("updates", MODE_PRIVATE) }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
        }
        setContentView(web)
        hideSystemUi()

        // po aktualizacji APK zaczynamy od wersji wbudowanej (cache mógł być starszy)
        val vc = currentVersionCode()
        if (prefs.getLong("apk_vc", -1) != vc) {
            webDir().deleteRecursively()
            prefs.edit().putLong("apk_vc", vc).remove("web_sha").apply()
        }

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
            loaded = true
        } else {
            thread {
                updateWeb()
                main.post { if (!loaded) loadGame() }
            }
            main.postDelayed({ if (!loaded) loadGame() }, START_TIMEOUT_MS)
        }
        thread { checkApkUpdate() }
    }

    private fun webDir() = File(filesDir, "web")

    private fun loadGame() {
        loaded = true
        val idx = File(webDir(), "index.html")
        web.loadUrl(if (idx.exists()) "file://${idx.absolutePath}" else "file:///android_asset/index.html")
    }

    // ---------- sieć ----------
    private fun httpGet(url: String, accept: String? = null): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 4000
        c.readTimeout = 8000
        c.useCaches = false
        c.setRequestProperty("User-Agent", "GierkaOliwka-App")
        accept?.let { c.setRequestProperty("Accept", it) }
        try {
            if (c.responseCode != 200) throw IOException("HTTP ${c.responseCode}")
            return c.inputStream.use { it.readBytes() }
        } finally {
            c.disconnect()
        }
    }

    /** Pobiera pliki gry z najnowszego commita (lista w files.txt). */
    private fun updateWeb(): Boolean = try {
        val sha = String(httpGet(
            "https://api.github.com/repos/$OWNER/$REPO/commits/main",
            "application/vnd.github.sha"
        )).trim()
        if (sha.length < 7) throw IOException("bad sha")
        if (sha == prefs.getString("web_sha", null) && File(webDir(), "index.html").exists()) {
            false
        } else {
            val base = "https://raw.githubusercontent.com/$OWNER/$REPO/$sha/$WEB_PATH/"
            val files = String(httpGet(base + "files.txt")).lines()
                .map { it.trim() }
                .filter { it.isNotEmpty() && !it.startsWith("#") && !it.contains("..") }
            val tmp = File(filesDir, "web_tmp")
            tmp.deleteRecursively(); tmp.mkdirs()
            for (f in files) {
                val out = File(tmp, f)
                out.parentFile?.mkdirs()
                out.writeBytes(httpGet(base + f))
            }
            if (!File(tmp, "index.html").exists()) throw IOException("no index")
            webDir().deleteRecursively()
            if (!tmp.renameTo(webDir())) throw IOException("rename")
            prefs.edit().putString("web_sha", sha).apply()
            true
        }
    } catch (e: Exception) {
        false
    }

    // ---------- aktualizacja APK ----------
    @Suppress("DEPRECATION")
    private fun currentVersionCode(): Long {
        val pi = packageManager.getPackageInfo(packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else pi.versionCode.toLong()
    }

    private fun checkApkUpdate() {
        try {
            val json = JSONObject(String(httpGet("https://api.github.com/repos/$OWNER/$REPO/releases/latest")))
            val tag = json.getString("tag_name")                 // v1.0.N
            val n = tag.substringAfterLast('.').toLongOrNull() ?: return
            if (n <= currentVersionCode()) return
            val assets = json.getJSONArray("assets")
            var url: String? = null
            for (i in 0 until assets.length()) {
                val a = assets.getJSONObject(i)
                if (a.getString("name").endsWith(".apk")) url = a.getString("browser_download_url")
            }
            val apkUrl = url ?: return
            main.post {
                if (isFinishing) return@post
                AlertDialog.Builder(this)
                    .setTitle("Nowa wersja ($tag)")
                    .setMessage("Jest nowsza wersja aplikacji. Zaktualizować teraz?")
                    .setPositiveButton("Aktualizuj") { _, _ -> downloadApk(apkUrl) }
                    .setNegativeButton("Później", null)
                    .show()
            }
        } catch (_: Exception) {
        }
    }

    private fun downloadApk(url: String) {
        val bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            setPadding(60, 30, 60, 30)
        }
        val dlg = AlertDialog.Builder(this)
            .setTitle("Pobieranie aktualizacji…")
            .setView(bar)
            .setCancelable(false)
            .show()
        thread {
            try {
                val out = File(cacheDir, "update.apk")
                val c = URL(url).openConnection() as HttpURLConnection
                c.instanceFollowRedirects = true
                c.connectTimeout = 10000
                c.readTimeout = 30000
                c.setRequestProperty("User-Agent", "GierkaOliwka-App")
                if (c.responseCode != 200) throw IOException("HTTP ${c.responseCode}")
                val total = c.contentLengthLong
                c.inputStream.use { inp ->
                    out.outputStream().use { o ->
                        val buf = ByteArray(64 * 1024)
                        var done = 0L
                        while (true) {
                            val r = inp.read(buf)
                            if (r < 0) break
                            o.write(buf, 0, r)
                            done += r
                            if (total > 0) {
                                val pct = (done * 100 / total).toInt()
                                main.post { bar.progress = pct }
                            }
                        }
                    }
                }
                c.disconnect()
                main.post { dlg.dismiss(); installApk(out) }
            } catch (e: Exception) {
                main.post {
                    dlg.dismiss()
                    Toast.makeText(this, "Nie udało się pobrać aktualizacji", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun installApk(f: File) {
        if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
            pendingApk = f
            Toast.makeText(this, "Zezwól na instalowanie z tej aplikacji i wróć do gry", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            return
        }
        pendingApk = null
        web.evaluateJavascript("window.saveGame && window.saveGame()", null)
        val uri = FileProvider.getUriForFile(this, "$packageName.files", f)
        startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    // ---------- cykl życia / UI ----------
    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onPause() {
        super.onPause()
        web.evaluateJavascript("window.saveGame && window.saveGame()", null)
        web.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        pendingApk?.let {
            if (Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls()) installApk(it)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }
}
