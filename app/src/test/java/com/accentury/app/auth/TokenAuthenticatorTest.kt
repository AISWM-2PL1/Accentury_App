package com.accentury.app.auth

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class TokenAuthenticatorTest {

    private lateinit var server: MockWebServer
    private val refreshCalls = AtomicInteger()
    private val meCalls = AtomicInteger()

    /** 갱신 응답. 테스트마다 바꿔 끼운다. */
    @Volatile
    private var refreshResponse: () -> MockResponse = {
        MockResponse().setBody("""{"accessToken":"jwt_new","refreshToken":"rt_new","accessTokenExpiresInSec":900}""")
    }

    private val meBody = """{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}"""
    private val unauthorized = MockResponse().setResponseCode(401)
        .setBody("""{"code":"AUTH_TOKEN_INVALID","message":"x","retryable":false,"correlationId":"c"}""")

    @Before
    fun setUp() {
        server = MockWebServer()
        // 서버 흉내: jwt_new만 받아 주고, 옛 토큰은 401이다. 갱신은 호출 수를 센다.
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse = when (request.path) {
                "/v0/auth/refresh" -> {
                    refreshCalls.incrementAndGet()
                    // 동시 401이 전부 갱신 줄에 서도록 조금 늦게 답한다.
                    Thread.sleep(100)
                    refreshResponse()
                }
                "/v0/users/me" -> {
                    meCalls.incrementAndGet()
                    if (request.getHeader("Authorization") == "Bearer jwt_new") {
                        MockResponse().setBody(meBody)
                    } else {
                        unauthorized
                    }
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

    private fun clients(store: TokenStore) = AuthClients(server.url("/").toString(), store)

    @Test
    fun `401이면 갱신하고 새 Bearer로 원래 요청을 다시 보내 성공한다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))

        val result = clients(store).api.me()

        assertTrue(result is AuthResult.Success)
        assertEquals(1, refreshCalls.get())
        // 회전된 쌍을 통째로 저장했다.
        assertEquals(AuthTokens("jwt_new", "rt_new"), store.tokens)
        // 첫 요청(옛 토큰) + 재시도(새 토큰)
        assertEquals(2, meCalls.get())
        val refresh = (1..3).map { server.takeRequest() }.first { it.path == "/v0/auth/refresh" }
        assertEquals("""{"refreshToken":"rt_old"}""", refresh.body.readUtf8())
        assertNull(refresh.getHeader("Authorization"))
    }

    @Test
    fun `갱신한 쌍의 저장이 실패해도 새 Bearer로 다시 보내 성공하고 메모리에는 새 쌍이 남는다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old")).apply { persists = false }

        val result = clients(store).api.me()

        assertTrue(result is AuthResult.Success)
        assertEquals(1, refreshCalls.get())
        assertEquals(2, meCalls.get())
        assertEquals(AuthTokens("jwt_new", "rt_new"), store.read())
    }

    @Test
    fun `동시에 5개가 401을 받아도 갱신은 한 번만 나간다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))
        val api = clients(store).api

        // 5 = OkHttp 디스패처의 호스트당 동시 상한. 갱신이 같은 줄에 서면 여기서 교착된다 (AuthClients KDoc).
        val results = (1..5).map { async { api.me() } }.awaitAll()

        assertTrue(results.toString(), results.all { it is AuthResult.Success })
        assertEquals(1, refreshCalls.get())
        assertEquals(AuthTokens("jwt_new", "rt_new"), store.tokens)
    }

    @Test
    fun `갱신이 401이면 저장소를 비우고 로그아웃 신호를 내며 재시도 고리를 돌지 않는다`() = runTest {
        refreshResponse = {
            MockResponse().setResponseCode(401)
                .setBody("""{"code":"AUTH_REFRESH_REUSED","message":"x","retryable":false,"correlationId":"c"}""")
        }
        val store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))
        val clients = clients(store)
        var signedOut = 0
        clients.refresher.onSignedOut = { signedOut++ }

        val result = clients.api.me()

        assertEquals(401, (result as AuthResult.Rejected).status)
        assertNull(store.tokens)
        assertEquals(1, signedOut)
        assertEquals(1, refreshCalls.get())
        assertEquals(1, meCalls.get())
    }

    @Test
    fun `갱신이 503이면 토큰을 지우지 않고 이번 요청만 실패한다`() = runTest {
        refreshResponse = {
            MockResponse().setResponseCode(503)
                .setBody("""{"code":"AUTH_STORE_UNAVAILABLE","message":"x","retryable":true,"correlationId":"c"}""")
        }
        val store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))
        val clients = clients(store)
        var signedOut = 0
        clients.refresher.onSignedOut = { signedOut++ }

        val result = clients.api.me()

        assertEquals(401, (result as AuthResult.Rejected).status)
        assertEquals(AuthTokens("jwt_old", "rt_old"), store.tokens)
        assertEquals(0, signedOut)
    }

    @Test
    fun `새 토큰으로 다시 보낸 요청도 401이면 한 번에서 멈춘다`() = runTest {
        // 갱신은 되지만 서버가 새 토큰도 받지 않는 경우 (계정 삭제 등).
        refreshResponse = {
            MockResponse().setBody("""{"accessToken":"jwt_other","refreshToken":"rt_other","accessTokenExpiresInSec":900}""")
        }
        val store = InMemoryTokenStore(AuthTokens("jwt_old", "rt_old"))

        val result = clients(store).api.me()

        assertEquals(401, (result as AuthResult.Rejected).status)
        assertEquals(1, refreshCalls.get())
        assertEquals(2, meCalls.get())
    }

    @Test
    fun `토큰이 없으면 Bearer 없이 나가고 401이어도 갱신하지 않는다`() = runTest {
        val store = InMemoryTokenStore()

        val result = clients(store).api.me()

        assertTrue(result is AuthResult.Rejected)
        assertNull(server.takeRequest().getHeader("Authorization"))
        assertEquals(0, refreshCalls.get())
    }
}
