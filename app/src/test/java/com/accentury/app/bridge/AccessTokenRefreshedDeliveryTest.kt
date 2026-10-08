package com.accentury.app.bridge

import com.accentury.app.auth.AuthResult
import com.accentury.app.auth.AuthTokens
import com.accentury.app.auth.RefreshOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AccessTokenRefreshedDeliveryTest {

    @Test
    fun `새 Access가 저장된 결말만 ok다`() {
        assertEquals("ok", accessTokenRefreshResult(RefreshOutcome.Refreshed(TOKENS)))
    }

    @Test
    fun `Refresh 거절·판정 실패·예외는 전부 failed다`() {
        assertEquals("failed", accessTokenRefreshResult(RefreshOutcome.SignedOut))
        assertEquals("failed", accessTokenRefreshResult(RefreshOutcome.Failed(AuthResult.TransportError("timeout"))))
        assertEquals("failed", accessTokenRefreshResult(null))
    }

    @Test
    fun `회신은 onAccessTokenRefreshed 슬롯에 JSON이 아닌 문자열 그대로 간다`() {
        val js = accessTokenRefreshedDeliveryJs(RefreshOutcome.Refreshed(TOKENS))
        assertTrue(js, js.contains("window.AccenturyWeb.onAccessTokenRefreshed;"))
        assertTrue(js, js.contains("""f("ok")"""))
    }

    private companion object {
        val TOKENS = AuthTokens(accessToken = "a", refreshToken = "r")
    }
}
