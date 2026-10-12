package com.accentury.app.bridge

import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class IntonationRecordedDeliveryTest {

    /** 생성된 JS의 문자열 리터럴을 웹처럼 풀어 JSON으로 되돌린다 (ItemResultDeliveryTest와 같은 경계 문구). */
    private fun decodePayload(js: String): String =
        Json.decodeFromString(String.serializer(), js.substringAfter("return false;f(").substringBeforeLast(");return true;})()"))

    @Test
    fun `onIntonationRecorded 슬롯으로 간다`() {
        val js = intonationRecordedDeliveryJs(IntonationRecorded(cardId = "card_1", attemptId = "la_1"))
        assertTrue(js.contains("window.AccenturyWeb.onIntonationRecorded"))
    }

    @Test
    fun `payload는 cardId·attemptId 두 필드뿐이다`() {
        val js = intonationRecordedDeliveryJs(IntonationRecorded(cardId = "card_1", attemptId = "la_abc"))
        assertEquals(
            JsonObject(mapOf("cardId" to JsonPrimitive("card_1"), "attemptId" to JsonPrimitive("la_abc"))),
            Json.parseToJsonElement(decodePayload(js)),
        )
    }

    @Test
    fun `따옴표·줄 종결자가 든 값도 주입 JS를 깨지 않는다`() {
        val js = intonationRecordedDeliveryJs(IntonationRecorded(cardId = "c\"' ", attemptId = "la_1"))
        assertTrue(!js.contains(' '))
        val decoded = Json.parseToJsonElement(decodePayload(js)) as JsonObject
        assertEquals(JsonPrimitive("c\"' "), decoded["cardId"])
    }
}
