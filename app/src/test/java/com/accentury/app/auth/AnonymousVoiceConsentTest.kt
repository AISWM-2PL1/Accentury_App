package com.accentury.app.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** 익명 모드 동의 → 세션 body 버전 (KAN-270 5단계) */
class AnonymousVoiceConsentTest {

    @Test
    fun `동의하면 게시 문안 버전을 싣는다`() {
        assertEquals("2026-10-04", anonymousVoiceConsentVersion(true))
        assertEquals(VOICE_CONSENT_VERSION, anonymousVoiceConsentVersion(true))
    }

    @Test
    fun `미동의면 null이다`() {
        assertNull(anonymousVoiceConsentVersion(false))
    }
}
