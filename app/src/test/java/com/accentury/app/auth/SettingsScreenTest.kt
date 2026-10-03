package com.accentury.app.auth

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
}
