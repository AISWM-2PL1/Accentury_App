package com.accentury.app.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class IdpSignInTest {

    @Test
    fun `가짜 IdP - 구글은 idToken 칸에 싣는다`() {
        val credential = fakeLoginCredential(Provider.GOOGLE)
        assertEquals("fake:dev-google", credential.idToken)
        assertNull(credential.accessToken)
    }

    @Test
    fun `가짜 IdP - 카카오와 네이버는 accessToken 칸에 싣는다`() {
        assertEquals("fake:dev-kakao", fakeLoginCredential(Provider.KAKAO).accessToken)
        assertNull(fakeLoginCredential(Provider.KAKAO).idToken)
        assertEquals("fake:dev-naver", fakeLoginCredential(Provider.NAVER).accessToken)
        assertNull(fakeLoginCredential(Provider.NAVER).idToken)
    }

    @Test
    fun `가짜 IdP - 네이버는 refreshToken도 채우고 다른 제공자는 비운다`() {
        assertEquals("fake:dev-naver", fakeLoginCredential(Provider.NAVER).refreshToken)
        assertNull(fakeLoginCredential(Provider.KAKAO).refreshToken)
        assertNull(fakeLoginCredential(Provider.GOOGLE).refreshToken)
    }

    @Test
    fun `네이버 자격은 두 토큰을 싣고 toString에 토큰이 없다`() {
        val credential = loginCredentialOf(Provider.NAVER, "naver-access", refreshToken = "naver-refresh")
        assertEquals("naver-access", credential.accessToken)
        assertEquals("naver-refresh", credential.refreshToken)
        assertFalse(credential.toString().contains("naver-"))
    }

    @Test
    fun `가짜 sub는 서버가 받는 형식이다 - A-Za-z0-9 점 밑줄 하이픈 64자 이내`() {
        LOGIN_PROVIDERS.forEach { provider ->
            val credential = fakeLoginCredential(provider)
            val sub = (credential.idToken ?: credential.accessToken)!!.removePrefix("fake:")
            assertTrue(sub, Regex("[A-Za-z0-9._-]{1,64}").matches(sub))
        }
    }
}
