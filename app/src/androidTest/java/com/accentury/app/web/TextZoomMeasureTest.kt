package com.accentury.app.web

import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * `textZoom`과 루트 px 주입이 rem 길이·px 글자를 어떻게 바꾸는지 가르는 실측 (KAN-332, PR #72 리뷰).
 *
 * 글자 크기만 재면 두 모델(루트 rem 기준이 바뀜 / 모든 글자에 배율을 곱함)이 같은 값을 내서 가르지 못한다. 그래서 rem 폭(`#w`,
 * `width:10rem`)과 px 글자(`#c`, `font-size:16px`)를 함께 잰다. 2026-11-12 Pixel_8 에뮬레이터(WebView 155) 실측:
 * textZoom 200은 `#w` 160px·`#c` 32px(글자만 2배, rem 길이는 그대로)이라 iOS 주입·KAN-313 E2E의 루트 모델과 다르다.
 * 이래서 WebViewHost는 textZoom을 100에 고정하고 루트 px를 주입한다(`#w` 320px·`#c` 16px).
 * Chromium 근거: `font_builder.cc` GetComputedSizeFromSpecifiedSize(TextZoomFactor를 곱함), `css_to_length_conversion_data.cc`
 * FontSizes(rem은 루트 SpecifiedFontSize 기준).
 *
 * CI는 androidTest를 돌리지 않는다(app-test는 단위 테스트만). WebView 엔진이 바뀔 때 사람이 직접 돌리는 회귀 확인이다:
 * `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:connectedDebugAndroidTest
 * -Pandroid.testInstrumentationRunnerArguments.class=com.accentury.app.web.TextZoomMeasureTest`.
 * 로그 태그 `TextZoomMeasure`에 수치를 찍는다.
 */
@RunWith(AndroidJUnit4::class)
class TextZoomMeasureTest {

    // #early는 파서가 body를 읽는 도중(웹 main.tsx보다 앞) 루트 computed를 적어 둔다 — 문서 시작 주입이 첫 렌더 전에 닿는지 본다.
    private val html = """<html><head><meta name="viewport" content="width=device-width"></head><body>
        <script>window.__early=getComputedStyle(document.documentElement).fontSize;</script>
        <p id="a" style="font-size:1rem">x</p><p id="b" style="font-size:0.8125rem">x</p>
        <div id="w" style="width:10rem;height:1px"></div><p id="c" style="font-size:16px">x</p></body></html>"""

    private val probeJs = """(function(){
        function f(id){return getComputedStyle(document.getElementById(id)).fontSize;}
        return [getComputedStyle(document.documentElement).fontSize,f('a'),f('b'),
            String(document.getElementById('w').getBoundingClientRect().width),f('c'),
            window.__early,String(window.__hadRoot)].join(';');})()"""

    private data class Probe(
        val root: String, val a: String, val b: String, val w: String, val c: String,
        val early: String, val hadRoot: String,
    )

    /**
     * @param documentStart true면 WebViewHost와 같은 문서 시작 주입을 건다. 그 앞에 documentElement 유무를 적는 스크립트를 둔다
     * @param afterLoad 로드 뒤 evaluateJavascript로 돌릴 스크립트(onPageFinished 폴백 경로)
     */
    private fun measure(textZoom: Int, documentStart: String? = null, afterLoad: String? = null): Probe {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val loaded = CountDownLatch(1)
        val done = CountDownLatch(1)
        var result = ""
        lateinit var webView: WebView
        instrumentation.runOnMainSync {
            webView = WebView(instrumentation.targetContext).apply {
                settings.javaScriptEnabled = true
                settings.textZoom = textZoom
                if (documentStart != null) {
                    val rules = setOf("https://example.com")
                    WebViewCompat.addDocumentStartJavaScript(this, "window.__hadRoot=!!document.documentElement;", rules)
                    WebViewCompat.addDocumentStartJavaScript(this, documentStart, rules)
                }
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) = loaded.countDown()
                }
                layout(0, 0, 1080, 2000)
                loadDataWithBaseURL("https://example.com/", html, "text/html", "utf-8", null)
            }
        }
        check(loaded.await(10, TimeUnit.SECONDS)) { "page load timeout" }
        instrumentation.runOnMainSync {
            if (afterLoad != null) webView.evaluateJavascript(afterLoad, null)
            webView.evaluateJavascript(probeJs) { result = it.trim('"'); done.countDown() }
        }
        check(done.await(10, TimeUnit.SECONDS)) { "evaluateJavascript timeout" }
        instrumentation.runOnMainSync { webView.destroy() }
        Log.i(
            "TextZoomMeasure",
            "textZoom=$textZoom documentStart=${documentStart != null} afterLoad=${afterLoad != null} " +
                "root;1rem;0.8125rem;10rem폭;16px글자;파싱중root;문서시작documentElement = $result",
        )
        val p = result.split(';')
        return Probe(p[0], p[1], p[2], p[3], p[4], p[5], p[6])
    }

    @Test
    fun textZoom은_글자만_키우고_rem_길이는_그대로다() {
        val base = measure(100)
        assertEquals(listOf("16px", "16px", "13px", "160", "16px"), listOf(base.root, base.a, base.b, base.w, base.c))
        // 회귀 근거: textZoom 200은 px 글자까지 2배, rem 폭은 1배 — 루트 주입 모델과 다르다(그래서 100 고정).
        val zoomed = measure(200)
        assertEquals(listOf("32px", "32px", "160", "32px"), listOf(zoomed.root, zoomed.a, zoomed.w, zoomed.c))
    }

    @Test
    fun 루트_주입은_rem_글자와_길이를_함께_키우고_px_글자는_그대로다() {
        val injected = measure(100, afterLoad = webRootFontScript(webRootFontPx(2.0f)))
        // 채택 모델(iOS·KAN-313 E2E와 같음): rem 글자·폭 2배, px 글자 1배.
        assertEquals(listOf("32px", "32px", "320", "16px"), listOf(injected.root, injected.a, injected.w, injected.c))
    }

    @Test
    fun 문서_시작_주입은_파싱_중_스크립트보다_먼저_닿는다() {
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
        val p = measure(100, documentStart = webDocumentStartScript(webRootFontScript(webRootFontPx(2.0f))))
        Log.i("TextZoomMeasure", "문서 시작 시점 documentElement 존재 = ${p.hadRoot}")
        assertEquals(listOf("32px", "32px", "320", "16px"), listOf(p.root, p.a, p.w, p.c))
        assertEquals("32px", p.early)
    }
}
