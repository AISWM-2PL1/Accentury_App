package com.accentury.app.auth

import com.accentury.app.ads.AdConsent
import org.junit.Assert.assertEquals
import org.junit.Test

class SettingsScreenTest {

    @Test
    fun `로그인 방식은 네 제공자 모두 한국어로 읽힌다`() {
        assertEquals(
            listOf("구글", "카카오", "네이버", "애플"),
            Provider.entries.map(::providerName),
        )
    }

    @Test
    fun `맞춤형 광고 설정 행은 세 동의 값을 각각 한 줄로 보인다`() {
        assertEquals(
            listOf("맞춤형 광고 허용", "일반 광고만 보기", "아직 고르지 않음"),
            listOf(AdConsent.Granted, AdConsent.Denied, AdConsent.Unknown).map { adConsentSettingValue(it, enabled = true) },
        )
    }

    @Test
    fun `비활성 맞춤형 광고 설정 행은 값 대신 테스트 뒤에 바꿀 수 있다고 보인다`() {
        assertEquals("테스트가 끝난 뒤 바꿀 수 있어요", adConsentSettingValue(AdConsent.Granted, enabled = false))
    }
}
