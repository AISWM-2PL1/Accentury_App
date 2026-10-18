package com.accentury.app.bridge

import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UploadFailedDeliveryTest {

    /** 생성된 JS의 문자열 리터럴을 웹처럼 풀어 JSON으로 되돌린다 (ItemResultDeliveryTest와 같은 경계 문구). */
    private fun decodePayload(js: String): String =
        Json.decodeFromString(String.serializer(), js.substringAfter("return false;f(").substringBeforeLast(");return true;})()"))

    @Test
    fun `onUploadFailed 슬롯으로 itemId·attemptId 두 필드만 간다`() {
        val js = uploadFailedDeliveryJs(UploadFailed(itemId = "item_3", attemptId = "at_9"))

        assertTrue(js.contains("window.AccenturyWeb.onUploadFailed"))
        assertEquals(
            JsonObject(mapOf("itemId" to JsonPrimitive("item_3"), "attemptId" to JsonPrimitive("at_9"))),
            Json.parseToJsonElement(decodePayload(js)),
        )
    }
}
