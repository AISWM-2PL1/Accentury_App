package com.accentury.app.auth

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AuthApiTest {

    private lateinit var server: MockWebServer
    private val store = InMemoryTokenStore(AuthTokens("jwt_a", "rt_a"))
    private lateinit var api: AuthApi

    private val loginBody = """
        {"accessToken":"jwt_1","refreshToken":"rt_1","accessTokenExpiresInSec":900,"isNewUser":true,
         "profileStatus":"INCOMPLETE","user":{"id":"u-1","provider":"KAKAO","email":null,"extra":"무시"}}
    """.trimIndent()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        api = AuthClients(server.url("/").toString(), store).api
    }

    @After
    fun tearDown() {
        runCatching { server.shutdown() }
    }

    private fun credential(provider: Provider) = when (provider) {
        Provider.GOOGLE, Provider.APPLE -> LoginCredential(provider, idToken = "fake:g")
        Provider.KAKAO, Provider.NAVER -> LoginCredential(provider, accessToken = "fake:k")
    }

    @Test
    fun `로그인 바디 - 구글은 idToken, 동의와 방침 버전을 싣고 null 키는 없다`() = runTest {
        server.enqueue(MockResponse().setBody(loginBody))

        api.login(credential(Provider.GOOGLE), privacyPolicyVersion = "2026-09")

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v0/auth/login", recorded.path)
        // 로그인은 토큰 없이 나간다 - 저장소에 쌍이 있어도.
        assertEquals(null, recorded.getHeader("Authorization"))
        val raw = recorded.body.readUtf8()
        assertFalse(raw, raw.contains("null"))
        val body = Json.parseToJsonElement(raw).jsonObject
        assertEquals(setOf("provider", "idToken", "privacyConsent", "privacyPolicyVersion"), body.keys)
        assertEquals("GOOGLE", body["provider"]!!.jsonPrimitive.content)
        assertEquals("fake:g", body["idToken"]!!.jsonPrimitive.content)
        assertEquals("true", body["privacyConsent"]!!.jsonPrimitive.content)
        assertEquals("2026-09", body["privacyPolicyVersion"]!!.jsonPrimitive.content)
    }

    @Test
    fun `로그인 바디 - 카카오는 accessToken을 보낸다`() = runTest {
        server.enqueue(MockResponse().setBody(loginBody))

        api.login(credential(Provider.KAKAO), privacyPolicyVersion = "v1")

        val body = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
        assertEquals(setOf("provider", "accessToken", "privacyConsent", "privacyPolicyVersion"), body.keys)
        assertEquals("fake:k", body["accessToken"]!!.jsonPrimitive.content)
    }

    @Test
    fun `로그인 바디 - 이름과 nonce는 줬을 때만 싣는다 (애플 최초 로그인)`() = runTest {
        server.enqueue(MockResponse().setBody(loginBody))

        api.login(
            LoginCredential(Provider.APPLE, idToken = "fake:a", nonce = "n-1", name = "홍길동"),
            privacyPolicyVersion = "v1",
        )

        val body = Json.parseToJsonElement(server.takeRequest().body.readUtf8()).jsonObject
        assertEquals("n-1", body["nonce"]!!.jsonPrimitive.content)
        assertEquals("홍길동", body["user"]!!.jsonObject["name"]!!.jsonPrimitive.content)
    }

    @Test
    fun `로그인 응답을 토큰 쌍과 계정으로 읽는다`() = runTest {
        server.enqueue(MockResponse().setBody(loginBody))

        val result = api.login(credential(Provider.KAKAO), privacyPolicyVersion = "v1")

        assertEquals(
            AuthResult.Success(
                LoginSuccess(
                    tokens = AuthTokens("jwt_1", "rt_1"),
                    isNewUser = true,
                    account = Account(ProfileStatus.INCOMPLETE, AuthUser(id = "u-1", provider = Provider.KAKAO)),
                ),
            ),
            result,
        )
    }

    @Test
    fun `오류 봉투를 상태 코드와 함께 거절로 옮긴다`() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(401).setBody(
                """{"code":"AUTH_IDP_TOKEN_INVALID","message":"로그인 정보를 확인하지 못했습니다.","retryable":false,"correlationId":"c"}""",
            ),
        )

        val result = api.login(credential(Provider.GOOGLE), privacyPolicyVersion = "v1")

        assertEquals(
            AuthResult.Rejected(401, "AUTH_IDP_TOKEN_INVALID", "로그인 정보를 확인하지 못했습니다.", false, null),
            result,
        )
    }

    @Test
    fun `봉투 없는 502는 상태 코드로 재시도 가능, 429는 Retry-After를 읽는다`() = runTest {
        server.enqueue(MockResponse().setResponseCode(502).setBody("<html/>"))
        server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "4").setBody("x"))

        val bad = api.login(credential(Provider.GOOGLE), "v1") as AuthResult.Rejected
        val limited = api.refresh("rt_a") as AuthResult.Rejected

        assertTrue(bad.retryable)
        assertEquals(502, bad.status)
        assertEquals(4_000L, limited.retryAfterMs)
    }

    @Test
    fun `성공 응답인데 토큰이 빠졌으면 재시도 가능한 거절이다`() = runTest {
        server.enqueue(MockResponse().setBody("""{"accessToken":"jwt_1"}"""))

        val result = api.refresh("rt_a")

        assertTrue(result is AuthResult.Rejected)
        assertTrue((result as AuthResult.Rejected).retryable)
    }

    @Test
    fun `프로필 제출은 Bearer로 PUT하고 계정을 돌려준다`() = runTest {
        server.enqueue(
            MockResponse().setBody("""{"profileStatus":"COMPLETE","user":{"id":"u-1","provider":"GOOGLE","region":"SEOUL"}}"""),
        )

        val result = api.updateProfile(ProfileInput("a@b.co", "이름", "2000-01-02", "FEMALE", "SEOUL"))

        val recorded = server.takeRequest()
        assertEquals("PUT", recorded.method)
        assertEquals("/v0/users/me/profile", recorded.path)
        assertEquals("Bearer jwt_a", recorded.getHeader("Authorization"))
        val body = Json.parseToJsonElement(recorded.body.readUtf8()).jsonObject
        assertEquals("2000-01-02", body["birthDate"]!!.jsonPrimitive.content)
        assertEquals("FEMALE", body["gender"]!!.jsonPrimitive.content)
        assertEquals(ProfileStatus.COMPLETE, (result as AuthResult.Success).value.profileStatus)
    }

    @Test
    fun `로그아웃은 204를 성공으로 본다`() = runTest {
        server.enqueue(MockResponse().setResponseCode(204))

        val result = api.logout("rt_a")

        val recorded = server.takeRequest()
        assertEquals("/v0/auth/logout", recorded.path)
        assertEquals("Bearer jwt_a", recorded.getHeader("Authorization"))
        assertEquals("""{"refreshToken":"rt_a"}""", recorded.body.readUtf8())
        assertEquals(AuthResult.Success(Unit), result)
    }

    @Test
    fun `서버가 없으면 전송 실패다`() = runTest {
        server.shutdown()

        assertTrue(api.me() is AuthResult.TransportError)
    }

    @Test
    fun `토큰과 개인 정보는 toString에 찍히지 않는다`() {
        val printed = listOf(
            AuthTokens("jwt_secret", "rt_secret"),
            LoginCredential(Provider.GOOGLE, idToken = "id_secret", name = "홍길동"),
            AuthUser(id = "u-1", provider = Provider.GOOGLE, email = "me@x.co", name = "홍길동"),
            ProfileInput("me@x.co", "홍길동", "2000-01-02", "MALE", "SEOUL"),
        ).joinToString()

        for (secret in listOf("jwt_secret", "rt_secret", "id_secret", "홍길동", "me@x.co", "2000-01-02")) {
            assertFalse(printed, printed.contains(secret))
        }
    }
}
