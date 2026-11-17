package com.accentury.app.recording

import com.accentury.app.audio.AudioQuality
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 녹음 중 소리 원의 크기 (KAN-354 움직임 타일 2). 원은 버튼 테두리(0)에서 1.35배(1)까지만 커져야 하고, 방 소음 정도의
 * 소리에서는 버튼에 붙어 있어야 한다 — 그 경계를 화면 밖에서 고정한다.
 */
class SoundRingLevelTest {
    @Test
    fun `통과선 아래 소리는 0이다 - 원이 버튼 테두리에 붙는다`() {
        assertEquals(0f, soundRingLevel(0.0))
        assertEquals(0f, soundRingLevel(30.0))
        assertEquals(0f, soundRingLevel(AudioQuality.QUIET_RMS_THRESHOLD))
    }

    @Test
    fun `전체 스케일 이상은 1에서 막힌다`() {
        assertEquals(1f, soundRingLevel(AudioQuality.FULL_SCALE))
        assertEquals(1f, soundRingLevel(AudioQuality.FULL_SCALE * 4))
    }

    @Test
    fun `말소리는 0과 1 사이에서 클수록 크다`() {
        val speech = soundRingLevel(2_000.0)
        val loud = soundRingLevel(10_000.0)
        assertTrue(speech > 0f && speech < 1f)
        assertTrue(loud > speech && loud < 1f)
    }
}
