package com.accentury.app.bridge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * startVoiceItem의 emotion (KAN-283). guideF0처럼 선택 필드라, 없거나 깨져도 문항은 살아야 한다 —
 * 칩 한 줄 때문에 녹음 화면이 안 뜨면 안 된다.
 */
class VoiceItemStartEmotionTest {
    private fun payload(emotionJson: String?, guideJson: String? = null): String = buildString {
        append("""{"itemId":"v1","prompt":"밥 묵었나","itemNumber":1,"totalItems":7,"maxDurationMs":10000""")
        if (emotionJson != null) append(""","emotion":$emotionJson""")
        if (guideJson != null) append(""","guideF0":$guideJson""")
        append("}")
    }

    @Test
    fun `emotion이 있으면 정의 값 그대로 받는다`() {
        assertEquals("부탁하는", parseVoiceItemStart(payload("\"부탁하는\""))?.emotion)
    }

    @Test
    fun `키가 없으면 null - 구버전 웹·emotion 없는 정의`() {
        val start = parseVoiceItemStart(payload(null))
        assertNotNull(start)
        assertNull(start!!.emotion)
    }

    @Test
    fun `빈 문자열은 그대로 받는다 - 칩 여부는 화면이 가른다`() {
        assertEquals("", parseVoiceItemStart(payload("\"\""))?.emotion)
    }

    @Test
    fun `emotion 타입이 어긋나도 문항은 살리고 emotion만 버린다`() {
        for (bad in listOf("123", "{}", "[\"부탁하는\"]", "true")) {
            val start = parseVoiceItemStart(payload(bad))
            assertNotNull("emotion=$bad 에서 문항이 거부됐다", start)
            assertNull("emotion=$bad 가 살아남았다", start!!.emotion)
        }
    }

    @Test
    fun `guideF0가 깨져도 멀쩡한 emotion은 남는다`() {
        val start = parseVoiceItemStart(payload("\"다급한\"", guideJson = "\"곡선 아님\""))
        assertNotNull(start)
        assertNull(start!!.guideF0)
        assertEquals("다급한", start.emotion)
    }

    @Test
    fun `emotion이 깨져도 멀쩡한 guideF0는 남는다`() {
        val guide = """{"unit":"semitone","frameIntervalMs":10,"values":[0.0,null,1.5]}"""
        val start = parseVoiceItemStart(payload("{}", guideJson = guide))
        assertNotNull(start)
        assertNull(start!!.emotion)
        assertEquals(3, start.guideF0?.values?.size)
    }
}
