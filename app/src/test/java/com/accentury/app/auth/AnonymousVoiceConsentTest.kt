package com.accentury.app.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    @Test
    fun `동의했고 지역이 없으면 지역을 묻는다 (KAN-270 7단계)`() {
        assertTrue(needsAnonymousRegion(consented = true, region = null))
    }

    @Test
    fun `동의했고 지역이 있으면 묻지 않는다`() {
        assertFalse(needsAnonymousRegion(consented = true, region = "SEOUL"))
    }

    @Test
    fun `미동의면 지역을 묻지 않고 body에도 싣지 않는다`() {
        assertFalse(needsAnonymousRegion(consented = false, region = null))
        assertNull(anonymousSessionRegion(consented = false, region = "SEOUL"))
        assertEquals("SEOUL", anonymousSessionRegion(consented = true, region = "SEOUL"))
    }
}
