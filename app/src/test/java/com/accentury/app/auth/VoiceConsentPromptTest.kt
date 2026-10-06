package com.accentury.app.auth

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceConsentPromptTest {

    private val user = AuthUser(id = "u-1", provider = Provider.GOOGLE)
    private val notConsented = VoiceConsent(consented = false, currentVersion = "2026-10-04")
    private val consented = VoiceConsent(true, "2026-10-04", "2026-10-06T01:02:03Z", "2026-10-04")

    @Test
    fun `미동의이고 아직 묻지 않았으면 띄운다`() {
        assertTrue(shouldPromptVoiceConsent(AuthGateState.SignedIn(user, notConsented), wasPrompted = false))
    }

    @Test
    fun `이미 물었으면 건너뛴 사용자라도 다시 띄우지 않는다`() {
        assertFalse(shouldPromptVoiceConsent(AuthGateState.SignedIn(user, notConsented), wasPrompted = true))
    }

    @Test
    fun `동의한 계정에는 띄우지 않는다`() {
        assertFalse(shouldPromptVoiceConsent(AuthGateState.SignedIn(user, consented), wasPrompted = false))
    }

    @Test
    fun `동의 상태를 모르면 띄우지 않는다`() {
        assertFalse(shouldPromptVoiceConsent(AuthGateState.SignedIn(user, voiceConsent = null), wasPrompted = false))
    }

    @Test
    fun `로그인과 추가 정보를 마치기 전에는 띄우지 않는다`() {
        assertFalse(shouldPromptVoiceConsent(AuthGateState.NeedsProfile(user), wasPrompted = false))
        assertFalse(shouldPromptVoiceConsent(AuthGateState.SignedOut(), wasPrompted = false))
    }
}
