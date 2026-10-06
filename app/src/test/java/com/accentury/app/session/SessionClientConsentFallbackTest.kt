package com.accentury.app.session

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

/** 동의 버전 폴백 (KAN-270 5단계, 웹 App.tsx와 같은 규칙) */
class SessionClientConsentFallbackTest {

    private data class Call(
        val previousToken: String?,
        val campaignToken: String?,
        val voiceConsentVersion: String?,
        val region: String? = null,
    )

    /** 미리 준 결과를 차례로 돌려주고 받은 인자를 적는다 */
    private class FakeClient(vararg results: SessionResult) : SessionClient {
        private val queue = ArrayDeque(results.toList())
        val calls = mutableListOf<Call>()

        override suspend fun create(
            appVersion: String,
            previousToken: String?,
            campaignToken: String?,
            voiceConsentVersion: String?,
            region: String?,
        ): SessionResult {
            calls += Call(previousToken, campaignToken, voiceConsentVersion, region)
            return queue.removeFirst()
        }
    }

    private val created = SessionResult.Created(Session("s", "st_new", "tv", 1, "sv", "2026-10-06T00:00:00Z"))
    private val validationFailed = SessionResult.Rejected("VALIDATION_FAILED", "m", retryable = false, retryAfterMs = null)

    private suspend fun FakeClient.run(version: String?) =
        createWithConsentFallback("1.0", previousToken = "st_old", campaignToken = "c1", voiceConsentVersion = version)

    @Test
    fun `동의를 실은 400 VALIDATION_FAILED는 동의 없이 한 번 더 만든다 - 이전 토큰·유입 코드는 그대로`() = runTest {
        val client = FakeClient(validationFailed, created)

        assertSame(created, client.run("2026-10-04"))
        assertEquals(
            listOf(Call("st_old", "c1", "2026-10-04"), Call("st_old", "c1", null)),
            client.calls,
        )
    }

    @Test
    fun `폴백 재시도에서도 region은 그대로 싣는다 (KAN-274)`() = runTest {
        val client = FakeClient(validationFailed, created)

        client.createWithConsentFallback(
            "1.0", previousToken = null, campaignToken = null, voiceConsentVersion = "2026-10-04", region = "JEJU",
        )

        // 지역은 동의와 무관한 값이다 - 동의만 빠지고 지역은 남는다
        assertEquals(listOf(Call(null, null, "2026-10-04", "JEJU"), Call(null, null, null, "JEJU")), client.calls)
    }

    @Test
    fun `두 번째도 실패하면 그 결과를 돌려주고 더 부르지 않는다`() = runTest {
        val second = SessionResult.TransportError("down")
        val client = FakeClient(validationFailed, second)

        assertSame(second, client.run("2026-10-04"))
        assertEquals(2, client.calls.size)
    }

    @Test
    fun `다른 거절은 재시도하지 않는다`() = runTest {
        val rateLimited = SessionResult.Rejected("RATE_LIMITED", "m", retryable = true, retryAfterMs = 1000)
        val client = FakeClient(rateLimited)

        assertSame(rateLimited, client.run("2026-10-04"))
        assertEquals(1, client.calls.size)
    }

    @Test
    fun `미동의 요청의 400 VALIDATION_FAILED는 재시도하지 않는다`() = runTest {
        val client = FakeClient(validationFailed)

        assertSame(validationFailed, client.run(null))
        assertEquals(1, client.calls.size)
    }

    @Test
    fun `성공은 한 번만 부른다`() = runTest {
        val client = FakeClient(created)

        assertSame(created, client.run("2026-10-04"))
        assertEquals(listOf(Call("st_old", "c1", "2026-10-04")), client.calls)
    }
}
