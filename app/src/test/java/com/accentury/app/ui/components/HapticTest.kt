package com.accentury.app.ui.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HapticTest {

    @Test
    fun `계약 문자열 세 개를 정확히 읽는다`() {
        assertEquals(Haptic.Tap, Haptic.fromBridgeValue("tap"))
        assertEquals(Haptic.Success, Haptic.fromBridgeValue("success"))
        assertEquals(Haptic.Error, Haptic.fromBridgeValue("error"))
    }

    @Test
    fun `계약 밖 문자열은 null이다 - 대소문자·공백 보정 없음`() {
        listOf("", "Tap", "TAP", " tap", "success ", "vibrate", "null").forEach {
            assertNull(it, Haptic.fromBridgeValue(it))
        }
    }
}
