package com.accentury.app.recording

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 대사 카드 캡션 (KAN-161 4단계). 아트보드는 "3 / 10 · 이 문장을 읽어주세요"인데, 문항 수를
 * 안 실어 보내는 구버전 웹이 있어(브리지 `VoiceItemStart`) 숫자가 0으로 들어올 수 있다.
 *
 * `0 / 0 ·`으로 시작하는 줄은 숫자가 아예 없는 것보다 나쁘다 — 사용자가 자기가 몇 번째인지
 * 잘못 읽는다. 그 갈림을 화면 밖으로 빼서 여기서 고정한다.
 */
class PromptCaptionTest {
    @Test
    fun `번호를 알면 진행과 안내를 한 줄로 붙인다`() {
        assertEquals("4 / 7 · 이 문장을 읽어주세요", promptCaption(4, 7))
        assertEquals("1 / 5 · 이 문장을 읽어주세요", promptCaption(1, 5))
    }

    @Test
    fun `번호를 모르면 안내만 남긴다 - 0 슬래시 0을 보여주지 않는다`() {
        assertEquals("이 문장을 읽어주세요", promptCaption(0, 0))
        assertEquals("이 문장을 읽어주세요", promptCaption(3, 0))
        assertEquals("이 문장을 읽어주세요", promptCaption(0, 10))
    }

    @Test
    fun `감정 칩 - emotion이 있으면 앞뒤 공백을 걷고 문구를 붙인다 (KAN-283)`() {
        assertEquals("부탁하는 느낌으로 말해주세요!", emotionCue("부탁하는"))
        assertEquals("다급한 느낌으로 말해주세요!", emotionCue("  다급한 "))
    }

    @Test
    fun `감정 칩 - null·빈 문자열·공백뿐이면 칩 없음 (KAN-283)`() {
        assertNull(emotionCue(null))
        assertNull(emotionCue(""))
        assertNull(emotionCue("  "))
    }
}
