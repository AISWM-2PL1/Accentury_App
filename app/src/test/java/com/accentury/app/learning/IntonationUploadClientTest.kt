package com.accentury.app.learning

import com.accentury.app.audio.ClientQuality
import com.accentury.app.auth.AuthClients
import com.accentury.app.auth.AuthTokens
import com.accentury.app.auth.InMemoryTokenStore
import com.accentury.app.net.TransportFailure
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

/**
 * 억양 녹음 업로드 (KAN-253, webview-bridge.md §12). 실제 앱처럼 [AuthClients.authedClient]를 태운다 — 계정 Bearer와
 * 401 갱신 1회·재시도 1회가 이 클라이언트에 있으므로, 흉내 클라이언트로는 그 규칙을 검증한 것이 아니다.
 */
class IntonationUploadClientTest {

    private lateinit var server: MockWebServer
    private val uploads = CopyOnWriteArrayList<RecordedRequest>()
    private val refreshCalls = AtomicInteger()

    /** 업로드 응답. 테스트마다 갈아끼운다. 인자는 실려 온 Authorization이다. */
    @Volatile
    private var uploadResponse: (String?) -> MockResponse = { accepted() }

    private val wav = ByteArray(32) { it.toByte() }
    private val quality = ClientQuality(rms = 0.1, peak = 0.8, silenceRatio = 0.1, clipped = false)

    private fun accepted() = MockResponse().setResponseCode(202).setBody(
        """{"attemptId":"la_1","contentVersion":"in-gn-2026.10.1","cardId":"card_1","status":"PROCESSING","pollAfterMs":1500}""",
    )

    private fun envelope(status: Int, code: String, retryable: Boolean) = MockResponse().setResponseCode(status)
        .setBody("""{"code":"$code","message":"서버 문구","retryable":$retryable,"correlationId":"c"}""")

    @Before
    fun setUp() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when {
                request.path == "/v0/auth/refresh" -> {
                    refreshCalls.incrementAndGet()
                    MockResponse().setBody("""{"accessToken":"jwt_new","refreshToken":"rt_new","accessTokenExpiresInSec":900}""")
                }
                request.path!!.startsWith("/v0/learning/") -> {
                    uploads += request
                    uploadResponse(request.getHeader("Authorization"))
                }
                else -> MockResponse().setResponseCode(404)
            }
        }
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    private fun client(store: InMemoryTokenStore = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))): IntonationUploadClient {
        val base = server.url("/").toString()
        return IntonationUploadClient(base, AuthClients(base, store).authedClient)
    }

    private suspend fun IntonationUploadClient.send(key: String = "li_key-1") = upload("card_1", key, wav, 2_000L, quality)

    @Test
    fun `카드 경로로 계정 Bearer와 멱등 키를 싣고 202의 attemptId를 읽는다`() = runTest {
        val result = client().send()

        assertEquals(IntonationUploadResult.Accepted("la_1"), result)
        val req = uploads.single()
        assertEquals("POST", req.method)
        assertEquals("/v0/learning/intonation-cards/card_1/recordings", req.path)
        assertEquals("Bearer jwt_old", req.getHeader("Authorization"))
        assertEquals("li_key-1", req.getHeader("Idempotency-Key"))
        // multipart는 레벨테스트와 같다 — audio(wav) + meta(json)
        val body = req.body.readUtf8()
        assertTrue(body.contains("""name="audio"; filename="recording.wav""""))
        assertTrue(body.contains("""name="meta""""))
        assertTrue(body.contains(""""durationMs":2000"""))
    }

    @Test
    fun `401이면 갱신 1회 뒤 같은 키·새 토큰으로 재시도 1회`() = runTest {
        uploadResponse = { auth -> if (auth == "Bearer jwt_new") accepted() else envelope(401, "AUTH_TOKEN_INVALID", false) }

        val result = client().send()

        assertEquals(IntonationUploadResult.Accepted("la_1"), result)
        assertEquals(1, refreshCalls.get())
        assertEquals(2, uploads.size)
        assertEquals(listOf("li_key-1", "li_key-1"), uploads.map { it.getHeader("Idempotency-Key") })
        assertEquals("Bearer jwt_new", uploads[1].getHeader("Authorization"))
    }

    @Test
    fun `재시도도 401이면 다시 갱신하지 않고 401 거절로 끝난다`() = runTest {
        uploadResponse = { envelope(401, "AUTH_TOKEN_INVALID", false) }

        val result = client().send()

        assertEquals(1, refreshCalls.get())
        assertEquals(2, uploads.size)
        assertEquals(IntonationUploadResult.Rejected(401, "AUTH_TOKEN_INVALID", "서버 문구", retryable = false), result)
    }

    @Test
    fun `봉투의 retryable을 그대로 옮긴다`() = runTest {
        uploadResponse = { envelope(415, "AUDIO_FORMAT_UNSUPPORTED", false) }
        assertEquals(
            IntonationUploadResult.Rejected(415, "AUDIO_FORMAT_UNSUPPORTED", "서버 문구", retryable = false),
            client().send(),
        )

        uploadResponse = { envelope(503, "ANALYSIS_UNAVAILABLE", true) }
        assertEquals(
            IntonationUploadResult.Rejected(503, "ANALYSIS_UNAVAILABLE", "서버 문구", retryable = true),
            client().send(),
        )
    }

    @Test
    fun `봉투가 없으면 상태 코드로 재시도 여부를 정한다`() = runTest {
        uploadResponse = { MockResponse().setResponseCode(502).setBody("<html>") }
        assertEquals(IntonationUploadResult.Rejected(502, null, null, retryable = true), client().send())
    }

    @Test
    fun `2xx인데 attemptId가 없으면 같은 키로 재시도할 수 있는 거절이다`() = runTest {
        uploadResponse = { MockResponse().setResponseCode(202).setBody("{}") }
        assertEquals(IntonationUploadResult.Rejected(202, null, null, retryable = true), client().send())
    }

    @Test
    fun `응답이 없으면 전송 실패다`() = runTest {
        val base = server.url("/").toString()
        server.shutdown()
        val result = IntonationUploadClient(base, AuthClients(base, InMemoryTokenStore(AuthTokens("a", "r"))).authedClient).send()
        assertEquals(IntonationUploadResult.TransportError(TransportFailure.ServerUnreachable), result)
    }
}
