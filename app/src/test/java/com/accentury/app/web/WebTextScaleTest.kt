package com.accentury.app.web

import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test

/** 웹 루트 글자 주입 (KAN-332). iOS `WebTextScaleTests`의 짝이다 — 같은 식·상한 200%·같은 스크립트 문자열. */
class WebTextScaleTest {

    @Test
    fun `OS 배율을 루트 px로 옮기고 200%에서 멈춘다`() {
        assertEquals(16.0, webRootFontPx(1.0f), 1e-4)
        assertEquals(13.6, webRootFontPx(0.85f), 1e-4)
        assertEquals(20.8, webRootFontPx(1.3f), 1e-4)
        assertEquals(32.0, webRootFontPx(2.0f), 1e-4)
        assertEquals(32.0, webRootFontPx(3.0f), 1e-4)
    }

    @Test
    fun `스크립트는 iOS와 같은 문자열이다`() {
        assertEquals(
            "document.documentElement.style.fontSize='17.6px';window.dispatchEvent(new Event('resize'));",
            webRootFontScript(17.6),
        )
        assertEquals(
            "document.documentElement.style.fontSize='32px';window.dispatchEvent(new Event('resize'));",
            webRootFontScript(32.0),
        )
        // 부동소수 꼬리(0.82 × 16 = 13.120000000000001)는 4자리에서 잘린다
        assertEquals(
            "document.documentElement.style.fontSize='13.12px';window.dispatchEvent(new Event('resize'));",
            webRootFontScript(0.82 * 16),
        )
        // Float 배율의 꼬리(0.85f → 13.6000003…)도 같은 규칙으로 잘린다
        assertEquals(
            "document.documentElement.style.fontSize='13.6px';window.dispatchEvent(new Event('resize'));",
            webRootFontScript(webRootFontPx(0.85f)),
        )
    }

    @Test
    fun `소수점이 쉼표인 기기 로케일에서도 점으로 적는다`() {
        val saved = Locale.getDefault()
        Locale.setDefault(Locale.GERMANY)
        try {
            assertEquals(
                "document.documentElement.style.fontSize='20.8px';window.dispatchEvent(new Event('resize'));",
                webRootFontScript(webRootFontPx(1.3f)),
            )
        } finally {
            Locale.setDefault(saved)
        }
    }
}
