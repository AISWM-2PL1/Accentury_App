package com.accentury.app.auth

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlinx.coroutines.yield
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TimeSource

class AuthGateControllerTest {

    private lateinit var server: MockWebServer

    private val user = AuthUser(id = "u-1", provider = Provider.GOOGLE)
    private val google = LoginCredential(Provider.GOOGLE, idToken = "fake:g")
    private val profile = ProfileInput("a@b.co", "이름", "2000-01-02", "MALE", "SEOUL")

    private fun account(status: String, voiceConsent: String? = null) =
        """{"profileStatus":"$status","user":{"id":"u-1","provider":"GOOGLE"}""" +
            (voiceConsent?.let { ""","voiceConsent":$it""" } ?: "") + "}"
    private fun consent(consented: Boolean) =
        if (consented) {
            """{"consented":true,"version":"2026-10-04","consentedAt":"2026-10-06T01:02:03Z","currentVersion":"2026-10-04"}"""
        } else {
            """{"consented":false,"version":null,"consentedAt":null,"currentVersion":"2026-10-04"}"""
        }
    private val loginComplete =
        """{"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":false,""" +
            """"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE"}}"""
    private val notConsented = VoiceConsent(false, null, null, "2026-10-04")
    private val consented = VoiceConsent(true, "2026-10-04", "2026-10-06T01:02:03Z", "2026-10-04")
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
    private fun TestScope.controller(
        store: TokenStore,
        logoutServerTimeout: Duration = 10.seconds,
    ): AuthGateController {
        val clients = AuthClients(server.url("/").toString(), store)
        return AuthGateController(clients.api, store, clients.refresher, backgroundScope, logoutServerTimeout)
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
    fun `로그아웃이 서버 응답 대기 중 취소돼도 IdP 정리와 로컬 정리, 로그인 화면 전환까지 끝낸다`() = runTest {
        val memory = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        // 실제 저장소(DataStore 쓰기)처럼 비우기가 중단점을 지난다 — 취소된 코루틴이면 여기서 취소 예외가 난다.
        val store = object : TokenStore by memory {
            override suspend fun clear() {
                yield()
                memory.clear()
            }
        }
        val gate = controller(store)
        // 취소가 반드시 서버 응답 전에 닿도록 응답을 문으로 막는다 — 회전으로 화면 스코프가 끊기는 경우(KAN-247 리뷰 P1).
        val requested = CountDownLatch(1)
        val release = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requested.countDown()
                release.await()
                return MockResponse().setResponseCode(204)
            }
        }
        var idpLoggedOut = false

        val screen = launch { gate.logout { idpLoggedOut = true } }
        withContext(Dispatchers.IO) { requested.await() }
        screen.cancel()
        assertFalse(idpLoggedOut) // 서버 응답 전이라 아직 IdP 정리 전이다 — 취소가 서버 대기 중에 닿았다
        release.countDown()
        screen.join()

        assertTrue(idpLoggedOut)
        assertNull(memory.tokens)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }

    @Test
    fun `로그아웃 서버 응답이 끝없이 흘러와도 상한 뒤 IdP 정리와 로컬 정리를 끝낸다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store, logoutServerTimeout = 300.milliseconds)
        // 헤더는 첫 0.1초 안에 오고 본문을 0.1초에 10바이트씩 10초 동안 흘린다 — 읽기 타임아웃(10초)에 안 걸리는
        // 찔끔 응답. 상한(0.3초)이 본문 읽기 도중에 닿는다(KAN-247 리뷰 재검증).
        server.enqueue(MockResponse().setBody("x".repeat(1_000)).throttleBody(10, 100, TimeUnit.MILLISECONDS))
        var idpLoggedOut = false

        val start = TimeSource.Monotonic.markNow()
        gate.logout { idpLoggedOut = true }
        val elapsed = start.elapsedNow()

        assertTrue("상한을 넘겨 기다렸다: $elapsed", elapsed < 5.seconds)
        assertTrue(idpLoggedOut)
        assertNull(store.tokens)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }

    @Test
    fun `IdP 로그아웃이 끝나지 않아도 상한 뒤 로컬 정리와 로그인 화면 전환은 끝낸다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setResponseCode(204))

        gate.logout { awaitCancellation() }

        assertNull(store.tokens)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }

    @Test
    fun `로그인으로 곧장 들어가면 me를 한 번 더 불러 음성 동의를 채운다`() = runTest {
        val gate = controller(InMemoryTokenStore())
        server.enqueue(MockResponse().setBody(loginComplete))
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(false))))

        gate.login(google, privacyPolicyVersion = "v1")

        assertEquals(AuthGateState.SignedIn(user, notConsented), gate.state.value)
        assertEquals("/v0/auth/login", server.takeRequest().path)
        val me = server.takeRequest()
        assertEquals("/v0/users/me", me.path)
        assertEquals("Bearer jwt_1", me.getHeader("Authorization"))
    }

    @Test
    fun `로그인 뒤 me가 5xx여도 동의를 모르는 채 들어간다`() = runTest {
        val store = InMemoryTokenStore()
        val gate = controller(store)
        server.enqueue(MockResponse().setBody(loginComplete))
        server.enqueue(MockResponse().setResponseCode(503).setBody(envelope("AUTH_STORE_UNAVAILABLE", true)))

        gate.login(google, privacyPolicyVersion = "v1")

        assertEquals(AuthGateState.SignedIn(user, voiceConsent = null), gate.state.value)
        assertEquals(AuthTokens("jwt_1", "rt_1"), store.tokens)
    }

    @Test
    fun `시작 확인과 프로필 제출은 응답의 음성 동의를 싣는다`() = runTest {
        val gate = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("INCOMPLETE")))
        gate.bootstrap()
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(false))))

        gate.submitProfile(profile)

        assertEquals(AuthGateState.SignedIn(user, notConsented), gate.state.value)
    }

    @Test
    fun `동의는 서버가 준 currentVersion을 PUT에 싣고 상태를 갱신한다`() = runTest {
        val gate = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(false))))
        gate.bootstrap()
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(true))))

        val result = gate.setVoiceConsent(true)

        assertTrue(result is AuthResult.Success)
        assertEquals(AuthGateState.SignedIn(user, consented), gate.state.value)
        server.takeRequest()
        server.takeRequest()
        val put = server.takeRequest()
        assertEquals("PUT", put.method)
        assertEquals("/v0/users/me/voice-consent", put.path)
        assertEquals("""{"version":"2026-10-04"}""", put.body.readUtf8())
    }

    @Test
    fun `동의 상태를 모르면 me로 버전을 먼저 읽고 동의한다`() = runTest {
        val gate = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        gate.bootstrap()
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(false))))
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(true))))

        gate.setVoiceConsent(true)

        assertEquals(AuthGateState.SignedIn(user, consented), gate.state.value)
        repeat(3) { server.takeRequest() }
        assertEquals("""{"version":"2026-10-04"}""", server.takeRequest().body.readUtf8())
    }

    @Test
    fun `철회는 DELETE 뒤 미동의로 바뀐다`() = runTest {
        val gate = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(true))))
        gate.bootstrap()
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(false))))

        gate.setVoiceConsent(false)

        assertEquals(AuthGateState.SignedIn(user, notConsented), gate.state.value)
        server.takeRequest()
        server.takeRequest()
        assertEquals("DELETE", server.takeRequest().method)
    }

    @Test
    fun `동의 변경이 실패하면 상태는 그대로이고 결과를 돌려준다`() = runTest {
        val gate = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(false))))
        gate.bootstrap()
        server.enqueue(MockResponse().setResponseCode(503).setBody(envelope("AUTH_STORE_UNAVAILABLE", true)))

        val result = gate.setVoiceConsent(true)

        assertTrue(result is AuthResult.Rejected)
        assertEquals(AuthGateState.SignedIn(user, notConsented), gate.state.value)
    }

    @Test
    fun `로그인 상태가 아니면 동의 변경은 아무것도 보내지 않는다`() = runTest {
        val gate = controller(InMemoryTokenStore())
        gate.bootstrap()

        val result = gate.setVoiceConsent(true)
        gate.reloadVoiceConsent()

        assertTrue(result is AuthResult.Rejected)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun `다시 읽기는 me로 동의 상태를 채운다`() = runTest {
        val gate = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        gate.bootstrap()
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(true))))

        gate.reloadVoiceConsent()

        assertEquals(AuthGateState.SignedIn(user, consented), gate.state.value)
    }

    @Test
    fun `로그인 뒤 me에서 갱신이 거절돼 저장소가 비면 로그인 화면이다`() = runTest {
        val store = InMemoryTokenStore()
        val gate = controller(store)
        server.enqueue(MockResponse().setBody(loginComplete))
        // me 401 → Authenticator 갱신 → 갱신 401 → 저장소 비움(onSignedOut). SignedIn으로 덮으면 안 된다(리뷰 P2-5).
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_TOKEN_INVALID", false)))
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_REFRESH_REUSED", false)))

        gate.login(google, privacyPolicyVersion = "v1")

        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertNull(store.tokens)
    }

    @Test
    fun `로그인 응답은 COMPLETE여도 뒤이은 me가 INCOMPLETE면 추가 정보 화면이다`() = runTest {
        val gate = controller(InMemoryTokenStore())
        server.enqueue(MockResponse().setBody(loginComplete))
        server.enqueue(MockResponse().setBody(account("INCOMPLETE")))

        gate.login(google, privacyPolicyVersion = "v1")

        // 더 새 정보(me)가 이긴다(리뷰 P2-5).
        assertEquals(AuthGateState.NeedsProfile(user), gate.state.value)
    }

    @Test
    fun `동의 요청 중 로그아웃이 끝나면 늦게 온 응답이 로그인 상태로 되돌리지 않는다`() = runTest {
        val gate = controller(InMemoryTokenStore(AuthTokens("jwt_0", "rt_0")))
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE", consent(false))))
        gate.bootstrap()
        // PUT 응답을 문으로 막아 두고 그 사이에 로그아웃을 끝낸다(리뷰 P2-5).
        val requested = CountDownLatch(1)
        val release = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                if (request.method != "PUT") return MockResponse().setResponseCode(204)
                requested.countDown()
                release.await()
                return MockResponse().setBody(account("COMPLETE", consent(true)))
            }
        }

        val consentJob = launch { gate.setVoiceConsent(true) }
        withContext(Dispatchers.IO) { requested.await() }
        gate.logout()
        release.countDown()
        consentJob.join()

        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }

    @Test
    fun `탈퇴 204면 토큰을 지우고 IdP 정리 뒤 로그인 화면이며 서버 로그아웃은 부르지 않는다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setResponseCode(204))
        var idpLoggedOut = false

        val outcome = gate.withdraw { idpLoggedOut = true }

        assertEquals(WithdrawOutcome.Withdrawn, outcome)
        assertNull(store.tokens)
        assertTrue(idpLoggedOut)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertEquals("/v0/users/me/withdrawal", server.takeRequest().path)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `탈퇴 401은 이미 탈퇴된 계정이라 탈퇴됨으로 정리한다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        // 실제 로그인 상태에서 시작해 갱신 거절 훅(onSignedOut)이 IdP 정리 전에 로그인 화면으로 돌리는 경로를 겨눈다(KAN-251 리뷰 P1).
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        gate.bootstrap()
        assertTrue(gate.state.value is AuthGateState.SignedIn)
        // 탈퇴 401 → Authenticator 갱신 → 서버가 Refresh를 이미 폐기해 401. 갱신 거절이 저장소를 먼저 비워도 IdP 정리는 빠지지 않는다.
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_TOKEN_INVALID", false)))
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_REFRESH_INVALID", false)))
        var stateDuringIdp: AuthGateState? = null

        val outcome = gate.withdraw { stateDuringIdp = gate.state.value }

        assertEquals(WithdrawOutcome.Withdrawn, outcome)
        assertEquals(AuthGateState.SignedOut(), stateDuringIdp)
        assertNull(store.tokens)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertEquals(
            listOf("/v0/auth/refresh", "/v0/users/me", "/v0/users/me/withdrawal", "/v0/auth/refresh"),
            List(4) { server.takeRequest().path },
        )
        assertEquals(4, server.requestCount)
    }

    @Test
    fun `탈퇴 401 뒤 IdP 정리 대기 중에 새로 로그인하면 새 토큰과 상태를 지우지 않는다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setBody(tokens(2)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        gate.bootstrap()
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_TOKEN_INVALID", false)))
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_REFRESH_INVALID", false)))
        server.enqueue(MockResponse().setBody(loginComplete))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        val entered = CompletableDeferred<Unit>()
        val release = CompletableDeferred<Unit>()

        // 탈퇴는 실제 시간 디스패처에서 돌린다 — runTest 가상 시간이면 로그인 네트워크를 기다리는 사이 IdP 상한(5초)을
        // 건너뛰어 정리가 로그인보다 먼저 끝나, 고치기 전 코드도 통과한다.
        val withdrawal = async(Dispatchers.Default) {
            gate.withdraw {
                entered.complete(Unit)
                release.await()
            }
        }
        entered.await()
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
        assertNull(store.tokens)
        gate.login(google, "v1")
        assertEquals(AuthGateState.SignedIn(user), gate.state.value)
        release.complete(Unit)

        assertEquals(WithdrawOutcome.Withdrawn, withdrawal.await())
        assertEquals(AuthTokens("jwt_1", "rt_1"), store.tokens)
        assertEquals(AuthGateState.SignedIn(user), gate.state.value)
    }

    @Test
    fun `탈퇴 정리가 저장 중인 새 로그인 토큰을 지우지 않는다`() = runTest {
        val store = HeldSaveTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setBody(tokens(2)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        gate.bootstrap()
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_TOKEN_INVALID", false)))
        server.enqueue(MockResponse().setResponseCode(401).setBody(envelope("AUTH_REFRESH_INVALID", false)))
        server.enqueue(MockResponse().setBody(loginComplete))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        val idpEntered = CompletableDeferred<Unit>()
        val idpRelease = CompletableDeferred<Unit>()

        // 실제 시간 디스패처에서 돌린다 — 가상 시간이면 IdP 상한(5초)을 건너뛰어 정리가 로그인보다 먼저 끝난다.
        val withdrawal = async(Dispatchers.Default) {
            gate.withdraw {
                idpEntered.complete(Unit)
                idpRelease.await()
            }
        }
        idpEntered.await()
        // 새 로그인의 저장이 저장소 잠금 안에서 붙잡힌 사이 IdP 정리를 끝낸다(KAN-251 리뷰 P1 재검증 2).
        store.holdNextSave()
        val login = async(Dispatchers.Default) { gate.login(google, "v1") }
        store.saveHeld.await()
        idpRelease.complete(Unit)
        withContext(Dispatchers.Default) { delay(200) }
        store.release.complete(Unit)
        login.await()

        assertEquals(WithdrawOutcome.Withdrawn, withdrawal.await())
        assertEquals(AuthTokens("jwt_1", "rt_1"), store.tokens)
        assertEquals(AuthGateState.SignedIn(user), gate.state.value)
    }

    @Test
    fun `탈퇴 정리 중에 앞서 시작된 갱신이 끝나도 새 로그인이 아니라 정리를 마친다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        gate.bootstrap()
        server.enqueue(MockResponse().setResponseCode(204))
        // 탈퇴 전에 시작된 기존 세션 갱신. 응답을 붙잡아 두었다가 IdP 정리 중에 풀어 쌍을 jwt_2로 바꾼다(KAN-251 리뷰 P1 재검증).
        val held = CompletableDeferred<Unit>()
        val refresher = TokenRefresher(store) { held.await(); AuthResult.Success(AuthTokens("jwt_2", "rt_2")) }
        val refreshing = async { refresher.refresh(staleAccess = null) }
        runCurrent()

        val outcome = gate.withdraw {
            held.complete(Unit)
            refreshing.await()
        }

        assertEquals(WithdrawOutcome.Withdrawn, outcome)
        assertEquals(RefreshOutcome.Refreshed(AuthTokens("jwt_2", "rt_2")), refreshing.await())
        assertNull(store.tokens)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }

    @Test
    fun `탈퇴 429면 탈퇴 안 됨으로 토큰을 두고 대기 시간을 알린다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(
            MockResponse().setResponseCode(429)
                .setBody("""{"code":"RATE_LIMITED","message":"m","retryable":true,"retryAfterMs":2100,"correlationId":"c"}"""),
        )
        var idpLoggedOut = false

        val outcome = gate.withdraw { idpLoggedOut = true }

        assertEquals(WithdrawOutcome.Failed(AuthFailure(AuthFailureReason.RateLimited, 3)), outcome)
        assertEquals(AuthTokens("jwt_0", "rt_0"), store.tokens)
        assertFalse(idpLoggedOut)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun `탈퇴 503이면 토큰과 로그인 상태를 그대로 두고 실패를 돌려준다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.enqueue(MockResponse().setBody(tokens(1)))
        server.enqueue(MockResponse().setBody(account("COMPLETE")))
        gate.bootstrap()
        val signedIn = gate.state.value
        server.enqueue(MockResponse().setResponseCode(503).setBody(envelope("AUTH_STORE_UNAVAILABLE", true)))
        var idpLoggedOut = false

        val outcome = gate.withdraw { idpLoggedOut = true }

        assertEquals(WithdrawOutcome.Failed(AuthFailure(AuthFailureReason.RetryLater)), outcome)
        assertEquals(AuthTokens("jwt_1", "rt_1"), store.tokens)
        assertFalse(idpLoggedOut)
        assertTrue(signedIn is AuthGateState.SignedIn)
        assertEquals(signedIn, gate.state.value)
    }

    @Test
    fun `탈퇴 전송이 실패하면 토큰과 상태를 그대로 두고 실패를 돌려준다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        server.shutdown()
        var idpLoggedOut = false

        val outcome = gate.withdraw { idpLoggedOut = true }

        assertEquals(WithdrawOutcome.Failed(AuthFailure(AuthFailureReason.Retry)), outcome)
        assertEquals(AuthTokens("jwt_0", "rt_0"), store.tokens)
        assertFalse(idpLoggedOut)
        assertEquals(AuthGateState.Checking, gate.state.value)
    }

    @Test
    fun `탈퇴 서버 응답이 상한을 넘기면 탈퇴 안 됨으로 토큰을 둔다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store, logoutServerTimeout = 300.milliseconds)
        server.enqueue(MockResponse().setResponseCode(204).setHeadersDelay(5, TimeUnit.SECONDS))

        val outcome = gate.withdraw()

        assertEquals(WithdrawOutcome.Failed(AuthFailure(AuthFailureReason.Retry)), outcome)
        assertEquals(AuthTokens("jwt_0", "rt_0"), store.tokens)
    }

    @Test
    fun `진행 중에 다시 탈퇴를 불러도 서버 요청은 한 번이고 같은 결과를 받는다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        val requested = CountDownLatch(1)
        val release = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requested.countDown()
                release.await()
                return MockResponse().setResponseCode(204)
            }
        }
        var idpCalls = 0

        val first = async { gate.withdraw { idpCalls++ } }
        withContext(Dispatchers.IO) { requested.await() }
        val second = async { gate.withdraw { idpCalls++ } }
        runCurrent()
        release.countDown()

        assertEquals(WithdrawOutcome.Withdrawn, first.await())
        assertEquals(WithdrawOutcome.Withdrawn, second.await())
        assertEquals(1, server.requestCount)
        assertEquals(1, idpCalls)
        assertNull(store.tokens)
    }

    @Test
    fun `탈퇴가 서버 응답 대기 중 취소돼도 IdP 정리와 로컬 정리까지 끝낸다`() = runTest {
        val store = InMemoryTokenStore(AuthTokens("jwt_0", "rt_0"))
        val gate = controller(store)
        val requested = CountDownLatch(1)
        val release = CountDownLatch(1)
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                requested.countDown()
                release.await()
                return MockResponse().setResponseCode(204)
            }
        }
        var idpLoggedOut = false

        val screen = launch { gate.withdraw { idpLoggedOut = true } }
        withContext(Dispatchers.IO) { requested.await() }
        screen.cancel()
        release.countDown()
        screen.join()

        assertTrue(idpLoggedOut)
        assertNull(store.tokens)
        assertEquals(AuthGateState.SignedOut(), gate.state.value)
    }
}

/**
 * 실제 KeystoreTokenStore처럼 save·clear를 한 잠금으로 세우고, 다음 save 한 번을 [release]까지 붙잡는 가짜 (KAN-251 리뷰 P1
 * 재검증 2). 붙잡힌 save 뒤에 온 clear는 save가 끝난 뒤에 돈다 — 고치기 전 코드의 경합이 이 순서에서 난다.
 */
private class HeldSaveTokenStore(initial: AuthTokens?) : TokenStore {
    private val inner = InMemoryTokenStore(initial)
    private val mutex = Mutex()

    @Volatile
    private var holding = false
    val saveHeld = CompletableDeferred<Unit>()
    val release = CompletableDeferred<Unit>()

    val tokens: AuthTokens? get() = inner.tokens

    fun holdNextSave() {
        holding = true
    }

    override suspend fun read(): AuthTokens? = inner.read()

    override suspend fun save(tokens: AuthTokens): Boolean = mutex.withLock {
        if (holding) {
            holding = false
            saveHeld.complete(Unit)
            release.await()
        }
        inner.save(tokens)
    }

    override suspend fun clear() = mutex.withLock { inner.clear() }
}
