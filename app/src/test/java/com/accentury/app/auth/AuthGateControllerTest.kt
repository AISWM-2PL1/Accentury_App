package com.accentury.app.auth

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import java.io.IOException
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AuthGateControllerTest {

    private lateinit var server: MockWebServer

    private val user = AuthUser(id = "u-1", provider = Provider.GOOGLE)
    private val google = LoginCredential(Provider.GOOGLE, idToken = "fake:g")
    private val profile = ProfileInput("a@b.co", "이름", "2000-01-02", "MALE", "SEOUL")

    private fun account(status: String) = """{"profileStatus":"$status","user":{"id":"u-1","provider":"GOOGLE"}}"""
    private fun tokens(n: Int) = """{"accessToken":"jwt_$n","refreshToken":"rt_$n","accessTokenExpiresInSec":900}"""
    private fun envelope(code: String, retryable: Boolean) =
        """{"code":"$code","message":"m","retryable":$retryable,"correlationId":"c"}"""

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        runCatching { server.shutdown() }
    }

    /** 앱 수명 스코프 자리는 테스트의 backgroundScope다 — 테스트가 끝나면 함께 정리된다. */
    private fun TestScope.controller(store: TokenStore): AuthGateController {
        val clients = AuthClients(server.url("/").toString(), store)
        return AuthGateController(clients.api, store, clients.refresher, backgroundScope)
    }

    @Test
    fun `저장된 토큰이 없으면 서버에 묻지 않고 로그인 화면이다`() = runTest {
        val gate = controller(InMemoryTokenStore())
        assertEquals(AuthGateState.Checking, gate.state.value)

        gate.bootstrap()

        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `로그인 INCOMPLETE는 추가 정보로, 제출이 COMPLETE면 들어간다`() = runTest {
        val store = InMemoryTokenStore()
        val gate = controller(store)
        server.enqueue(
            MockResponse().setBody(
                """{"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":true,""" +
                    """"profileStatus":"INCOMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}""",
            ),
        )
        server.enqueue(MockResponse().setBody(account("COMPLETE")))

        gate.login(google, privacyPolicyVersion = "v1")
        assertEquals(AuthGateState.NeedsProfile(user), gate.state.value)
        assertEquals(AuthTokens("jwt_1", "rt_1"), store.tokens)

        gate.submitProfile(profile)
        assertEquals(AuthGateState.SignedIn(user), gate.state.value)
        server.takeRequest()
        assertEquals("Bearer jwt_1", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `재시작 때 저장된 Refresh가 살아 있으면 갱신 후 곧장 들어간다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))

        gate.bootstrap()

        assertEquals(AuthGateState.SignedIn(user), gate.state.value)
        assertEquals(AuthTokens("jwt_1", "rt_1"), store.tokens)
        assertEquals("/v0/auth/refresh", server.takeRequest().path)
        assertEquals("Bearer jwt_1", server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun `재시작 때 Refresh가 거절되면 저장소를 비우고 로그인 화면이다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_REFRESH_INVALID", false)))

        gate.bootstrap()

        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertNull(store.tokens)
    }

    @Test
    fun `재시작 때 서버가 503이면 토큰을 두고 다시 시도 안내를 낸다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setResponseCode(503).setBody(envelope("AUTH_STORE_UNAVAILABLE", true)))

        gate.bootstrap()

        assertEquals(AuthGateState.CheckFailed(AuthFailure(AuthFailureReason.RetryLater)), gate.state.value)
        assertEquals(AuthTokens("jwt_0", "rt_0"), store.tokens)
    }

    @Test
    fun `만 14세 미만이면 추가 정보 화면에 남아 사유를 보인다`() = runTest {
        val store = InMemoryTokenStore()
        val gate = controller(store)
        server.enqueue(
            MockResponse().setBody(
                """{"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":true,""" +
                    """"profileStatus":"INCOMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}""",
            ),
        )
        server.enqueue(MockResponse().setResponseCode(400).setBody(envelope("AUTH_UNDER_AGE", false)))

        gate.login(google, privacyPolicyVersion = "v1")
        gate.submitProfile(profile)

        assertEquals(
            AuthGateState.NeedsProfile(user, AuthFailure(AuthFailureReason.UnderAge)),
            gate.state.value,
        )
    }

    @Test
    fun `로그인 실패는 갈래별 안내로 접힌다`() = runTest {
        val gate = controller(InMemoryTokenStore())
        val cases = listOf(
            MockResponse().setResponseCode(401).setBody(envelope("AUTH_IDP_TOKEN_INVALID", false)) to
                AuthFailure(AuthFailureReason.Retry),
            MockResponse().setResponseCode(502).setBody(envelope("AUTH_IDP_UNAVAILABLE", true)) to
                AuthFailure(AuthFailureReason.RetryLater),
            MockResponse().setResponseCode(429).setBody(
                """{"code":"RATE_LIMITED","message":"m","retryable":true,"retryAfterMs":2100,"correlationId":"c"}""",
            ) to AuthFailure(AuthFailureReason.RateLimited, 3L),
            MockResponse().setResponseCode(400).setBody(envelope("AUTH_CONSENT_REQUIRED", false)) to
                AuthFailure(AuthFailureReason.Unsupported),
        )
        for ((response, expected) in cases) {
            server.enqueue(response)
            gate.login(google, privacyPolicyVersion = "v1")
            assertEquals(AuthGateState.SignedOut(expected), gate.state.value)
        }
    }

    @Test
    fun `로그인 전송 실패는 다시 시도 갈래다`() = runTest {
        val gate = controller(InMemoryTokenStore())
        server.shutdown()

        gate.login(google, privacyPolicyVersion = "v1")

        assertEquals(AuthGateState.SignedOut(AuthFailure(AuthFailureReason.Retry)), gate.state.value)
    }

    @Test
    fun `로그인 토큰 저장이 실패하면 들어가지 않고 다시 시도 안내와 빈 저장소로 남는다`() = runTest {
        val store = InMemoryTokenStore().apply { persists = false }
        val gate = controller(store)
        server.enqueue(
            MockResponse().setBody(
                """{"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":false,""" +
                    """"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}""",
            ),
        )

        gate.login(google, privacyPolicyVersion = "v1")

        assertEquals(AuthGateState.SignedOut(AuthFailure(AuthFailureReason.Retry)), gate.state.value)
        assertNull(store.tokens)
    }

    @Test
    fun `세션 생성이 프로필 미완료로 막히면 추가 정보 화면으로 돌아간다`() = runTest {
        val gate = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        gate.bootstrap()

        gate.onProfileIncomplete()

        assertEquals(AuthGateState.NeedsProfile(user), gate.state.value)
    }

    @Test
    fun `로그아웃은 서버가 실패해도 로컬 토큰을 지우고 IdP 로그아웃도 부른다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setResponseCode(503).setBody(envelope("AUTH_STORE_UNAVAILABLE", true)))
        var idpLoggedOut = false

        gate.logout { idpLoggedOut = true }

        assertNull(store.tokens)
        assertTrue(idpLoggedOut)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertEquals("/v0/auth/logout", server.takeRequest().path)
    }

    @Test
    fun `설정 화면 로그아웃은 서버가 받으면 저장소를 비우고 IdP 로그아웃 뒤 로그인 화면이다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setResponseCode(204))
        var idpLoggedOut = false

        gate.logout { idpLoggedOut = true }

        assertNull(store.tokens)
        assertTrue(idpLoggedOut)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }

    @Test
    fun `로그아웃 전송이 실패해도 저장소를 비우고 로그인 화면이다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.shutdown()

        gate.logout()

        assertNull(store.tokens)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }

    @Test
    fun `IdP 로그아웃이 던져도 저장소는 비고 로그인 화면이며 예외는 호출자에게 간다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setResponseCode(204))

        val thrown = runCatching { gate.logout { throw IllegalStateException("SDK") } }.exceptionOrNull()

        assertTrue(thrown is IllegalStateException)
        assertNull(store.tokens)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }

    @Test
    fun `다른 요청에서 Refresh가 거절되면 게이트가 로그인 화면으로 돌아간다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val clients = AuthClients(server.url("/").toString(), store)
        val gate = AuthGateController(clients.api, store, clients.refresher, backgroundScope)
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        gate.bootstrap()
        // 예: 세션 생성이 401 → Authenticator 갱신 → 갱신 401
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_TOKEN_INVALID", false)))
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_REFRESH_REUSED", false)))

        clients.api.me()

        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertNull(store.tokens)
    }

    @Test
    fun `다시 시도는 부른 쪽이 취소돼도 앱 스코프에서 끝까지 간다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))

        // 화면 스코프(회전하면 취소되는 rememberCoroutineScope) 자리
        val screen = launch {
            gate.retry()
            awaitCancellation()
        }
        runCurrent()
        screen.cancelAndJoin()

        assertEquals(AuthGateState.SignedIn(user), gate.state.first { it != AuthGateState.Checking })
    }

    @Test
    fun `갱신 도중 취소된 시작 확인은 확인 중에 남지 않고 다시 시도 안내다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))

        val check = launch { gate.bootstrap() }
        withContext(Dispatchers.IO) { server.takeRequest() } // 갱신 요청이 서버에 닿았다
        check.cancelAndJoin()

        assertEquals(AuthGateState.CheckFailed(AuthFailure(AuthFailureReason.Retry)), gate.state.value)
        assertEquals(AuthTokens("jwt_0", "rt_0"), store.tokens)
    }

    @Test
    fun `저장소 읽기가 던지면 죽지 않고 로그인 화면이다`() = runTest {
        val broken = object : TokenStore {
            override suspend fun read(): AuthTokens? = throw IOException("손상")
            override suspend fun save(tokens: AuthTokens) = false
            override suspend fun clear() = Unit
        }
        val gate = controller(broken)

        gate.retry()

        assertEquals(AuthGateState.SignedOut(), gate.state.first { it != AuthGateState.Checking })
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `추가 정보 화면에서 다른 계정으로 로그인하면 저장소를 비우고 로그인 화면이다`() = runTest {
        val store = InMemoryTokenStore()
        val gate = controller(store)
        server.enqueue(
            MockResponse().setBody(
                """{"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":true,""" +
                    """"profileStatus":"INCOMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}""",
            ),
        )
        server.enqueue(MockResponse().setResponseCode(204))
        gate.login(google, privacyPolicyVersion = "v1")
        assertEquals(AuthGateState.NeedsProfile(user), gate.state.value)

        gate.logout()

        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertNull(store.tokens)
    }

    @Test
    fun `로그아웃이 서버 응답 대기 중 취소돼도 로컬 정리와 로그인 화면 전환은 끝낸다`() = runTest {
        val memory = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        // 실제 저장소(DataStore 쓰기)처럼 비우기가 중단점을 지난다 — 취소된 코루틴이면 여기서 취소 예외가 난다.
        val store = object : TokenStore by memory {
            override suspend fun clear() {
                yield()
                memory.clear()
            }
        }
        val gate = controller(store)
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))

        val screen = launch { gate.logout() }
        withContext(Dispatchers.IO) { server.takeRequest() }
        screen.cancelAndJoin()

        assertNull(memory.tokens)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }
}
