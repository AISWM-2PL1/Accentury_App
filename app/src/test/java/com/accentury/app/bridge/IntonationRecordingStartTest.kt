package com.accentury.app.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class IntonationRecordingStartTest {

    private val guide = """{"unit":"semitone","frameIntervalMs":50,"values":[0.0,null,1.5]}"""

    private fun payload(
        cardId: String = "card_1",
        prompt: String = "어데 가노?",
        standard: String = "\"어디 가니?\"",
        maxDurationMs: Long = 10_000L,
        guideF0: String = guide,
    ) = """{"cardId":"$cardId","prompt":"$prompt","standard":$standard,"maxDurationMs":$maxDurationMs,"guideF0":$guideF0}"""

    @Test
    fun `정상 payload를 그대로 읽는다`() {
        val start = parseIntonationRecordingStart(payload())
        assertEquals(
            IntonationRecordingStart(
                cardId = "card_1",
                prompt = "어데 가노?",
                standard = "어디 가니?",
                maxDurationMs = 10_000L,
                guideF0 = GuideF0(unit = "semitone", frameIntervalMs = 50, values = listOf(0.0, null, 1.5)),
            ),
            start,
        )
    }

    @Test
    fun `standard null은 유효하다 - 표준어 줄만 생략한다`() {
        assertNull(parseIntonationRecordingStart(payload(standard = "null"))!!.standard)
    }

    @Test
    fun `웹이 모르는 필드를 더 보내도 읽는다`() {
        assertNotNull(parseIntonationRecordingStart(payload().dropLast(1) + ""","seq":3}"""))
    }

    @Test
    fun `필수 필드가 빠지면 버린다`() {
        assertNull(parseIntonationRecordingStart("""{"prompt":"a","maxDurationMs":10000}"""))
        assertNull(parseIntonationRecordingStart("""{"cardId":"c","maxDurationMs":10000}"""))
        assertNull(parseIntonationRecordingStart("""{"cardId":"c","prompt":"a"}"""))
        assertNull(parseIntonationRecordingStart("not json"))
    }

    @Test
    fun `빈 cardId·빈 대사·0 이하 녹음 길이는 버린다`() {
        assertNull(parseIntonationRecordingStart(payload(cardId = " ")))
        assertNull(parseIntonationRecordingStart(payload(prompt = "")))
        assertNull(parseIntonationRecordingStart(payload(maxDurationMs = 0)))
    }

    @Test
    fun `guideF0 형식이 어긋나면 곡선만 버리고 녹음은 연다`() {
        val start = parseIntonationRecordingStart(payload(guideF0 = """{"unit":"semitone","values":"x"}"""))
        assertNotNull(start)
        assertNull(start!!.guideF0)
        assertEquals("card_1", start.cardId)
    }

    @Test
    fun `guideF0가 없어도 유효하다`() {
        val json = """{"cardId":"c","prompt":"a","standard":null,"maxDurationMs":10000}"""
        assertNull(parseIntonationRecordingStart(json)!!.guideF0)
    }
}
