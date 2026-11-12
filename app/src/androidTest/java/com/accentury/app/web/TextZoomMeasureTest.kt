package com.accentury.app.web

import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

/**
 * `textZoom`이 rem 기준(루트 computed font-size)까지 바꾸는지 실측한다 (KAN-332 1단계).
 *
 * 이 결과로 WebViewHost가 textZoom을 OS 배율 그대로 쓰기로 정했다(A안) — 2026-11-12 Pixel_8 에뮬레이터 실측에서
 * textZoom=200이면 루트 computed 32px, 1rem 자식 32px, 0.8125rem 자식 26px로 이중 확대가 없었다.
 * 엔진(WebView 버전)이 바뀌면 이 전제가 깨질 수 있어 회귀 확인용으로 남긴다. 로그 태그 `TextZoomMeasure`에 수치를 찍는다.
 */
@RunWith(AndroidJUnit4::class)
class TextZoomMeasureTest {

    private val html = """<html><head><meta name="viewport" content="width=device-width"></head><body>
        <p id="a" style="font-size:1rem">x</p><p id="b" style="font-size:0.8125rem">x</p></body></html>"""

    private val probeJs = """(function(){
        var r=getComputedStyle(document.documentElement).fontSize;
        function m(id){var e=document.getElementById(id);return getComputedStyle(e).fontSize+'|'+e.getBoundingClientRect().height;}
        return r+';'+m('a')+';'+m('b');})()"""

    private fun measure(textZoom: Int): String {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val loaded = CountDownLatch(1)
        val done = CountDownLatch(1)
        var result = ""
        lateinit var webView: WebView
        instrumentation.runOnMainSync {
            webView = WebView(instrumentation.targetContext).apply {
                settings.javaScriptEnabled = true
                settings.textZoom = textZoom
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) = loaded.countDown()
                }
                layout(0, 0, 1080, 2000)
                loadDataWithBaseURL("https://example.com/", html, "text/html", "utf-8", null)
            }
        }
        check(loaded.await(10, TimeUnit.SECONDS)) { "page load timeout" }
        instrumentation.runOnMainSync {
            webView.evaluateJavascript(probeJs) { result = it.trim('"'); done.countDown() }
        }
        check(done.await(10, TimeUnit.SECONDS)) { "evaluateJavascript timeout" }
        instrumentation.runOnMainSync { webView.destroy() }
        Log.i("TextZoomMeasure", "textZoom=$textZoom root;a(font|height);b(font|height) = $result")
        return result
    }

    @Test
    fun textZoom100과_200의_루트와_rem_자식_크기() {
        val base = measure(100)
        val zoomed = measure(200)
        Log.i("TextZoomMeasure", "base=$base zoomed=$zoomed")
        // 루트;#a;#b 글자 크기만 단언한다 (높이는 행간 반올림이라 로그로만 본다).
        fun fonts(r: String) = r.split(';').map { it.substringBefore('|') }
        assertEquals(listOf("16px", "16px", "13px"), fonts(base))
        // A안의 전제: textZoom이 루트 rem 기준을 바꾸고, rem 자식은 그 기준만 따른다(이중 확대 없음).
        assertEquals(listOf("32px", "32px", "26px"), fonts(zoomed))
    }
}
