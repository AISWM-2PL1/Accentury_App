package com.accentury.app.auth

import com.accentury.app.net.await
import com.accentury.app.net.decodeErrorEnvelope
import com.accentury.app.net.isRetryableStatus
import com.accentury.app.net.retryAfterMsOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.UUID

// 서버 계약(KAN-223, API 명세서 §3.9~§3.13)에 묶인 값들. 계약이 바뀌면 여기만 고친다.
private const val PATH_LOGIN = "v0/auth/login"
private const val PATH_REFRESH = "v0/auth/refresh"
private const val PATH_LOGOUT = "v0/auth/logout"
private const val PATH_ME = "v0/users/me"
private const val PATH_PROFILE = "v0/users/me/profile"
private const val JSON_MEDIA_TYPE = "application/json"
private const val HEADER_CORRELATION_ID = "X-Correlation-Id"
private const val HEADER_RETRY_AFTER = "Retry-After"

/** 인증 API 한 번의 결과. 판정(무엇을 보여줄지)은 [AuthGateController]가 한다 — [com.accentury.app.session.SessionResult]와 같은 모양이다. */
sealed interface AuthResult<out T> {

    data class Success<T>(val value: T) : AuthResult<T>

    /**
     * 서버가 응답은 했지만 원하는 값을 주지 않았다. [status] 외 필드는 공통 오류 봉투(§2.4) 그대로다.
     *
     * [status]를 들고 있는 이유: 세션 생성과 달리 여기서는 401이 "다시 로그인"이라는 별도 복구 경로다.
     * 봉투를 못 읽는 401(프록시가 끼어든 경우 등)도 같은 경로로 보내려면 코드가 아니라 상태로 봐야 한다.
     */
    data class Rejected(
        val status: Int,
        val code: String?,
        val message: String?,
        val retryable: Boolean,
        val retryAfterMs: Long?,
    ) : AuthResult<Nothing>

    /** 응답이 아예 오지 않은 전송 실패. 의미상 항상 재시도 가능. */
    data class TransportError(val reason: String) : AuthResult<Nothing>
}

/** 로그인 제공자 (§3.9). GOOGLE·APPLE은 ID 토큰을, KAKAO·NAVER는 IdP Access 토큰을 보낸다. */
enum class Provider { GOOGLE, KAKAO, NAVER, APPLE }

enum class ProfileStatus { COMPLETE, INCOMPLETE }

/**
 * IdP SDK가 준 로그인 자격 한 건 (KAN-224).
 *
 * 로컬 개발에서는 서버의 가짜 IdP가 `fake:<sub>`를 토큰으로 받는다 — SDK 없이 게이트를 돌려볼 수 있다.
 *
 * @property idToken GOOGLE·APPLE
 * @property accessToken KAKAO·NAVER의 IdP Access 토큰 (우리 서버 토큰이 아니다)
 * @property refreshToken NAVER 필수. 네이버 SDK의 Refresh 토큰이다. 서버가 우리 Client ID와 Secret으로 교환해 우리 앱이
 *   발급받은 토큰인지 확인한다 (KAN-243). 우리 서버의 Refresh 토큰(`rt_...`)이 아니고, 앱은 저장하지 않는다.
 * @property nonce APPLE 필수 (서버가 ID 토큰의 nonce와 대조한다)
 * @property name APPLE이 최초 로그인에만 주는 이름. 다른 제공자는 null
 */
data class LoginCredential(
    val provider: Provider,
    val idToken: String? = null,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val nonce: String? = null,
    val name: String? = null,
) {
    override fun toString(): String = "LoginCredential[provider=$provider]"
}

/**
 * 서버의 UserView (§3.11). 이메일·이름·생년월일·성별·지역은 계정 개인 정보다.
 *
 * @property region 출신지역 코드 10개 중 하나 (서버 Region 열거형 이름). 미입력이면 null
 */
@Serializable
data class AuthUser(
    val id: String,
    val provider: Provider,
    val email: String? = null,
    val name: String? = null,
    val birthDate: String? = null,
    val gender: String? = null,
    val region: String? = null,
    val nickname: String? = null,
    val profileImageUrl: String? = null,
) {
    // id만 찍는다 — 나머지는 개인 정보다 (서버 UserView.toString과 같은 규칙).
    override fun toString(): String = "AuthUser[id=$id]"
}

/** `GET /v0/users/me`·`PUT /v0/users/me/profile`의 응답 (§3.10·§3.11). */
@Serializable
data class Account(val profileStatus: ProfileStatus, val user: AuthUser)

/** 로그인 성공 (§3.9). [isNewUser]는 가입 계측용으로만 쓴다 — 화면 분기는 [account]의 profileStatus가 정한다. */
data class LoginSuccess(val tokens: AuthTokens, val isNewUser: Boolean, val account: Account)

/**
 * 추가 정보 입력값 (§3.10).
 *
 * @property birthDate `YYYY-MM-DD`. 만 14세 미만은 400 `AUTH_UNDER_AGE`
 * @property gender `MALE` | `FEMALE`
 * @property region 출신지역 코드 10개 중 하나 (`SEOUL`, `GYEONGGI`, `GANGWON`, `CHUNGBUK`, `CHUNGNAM`,
 *   `JEONBUK`, `JEONNAM`, `GYEONGBUK`, `GYEONGNAM`, `JEJU`)
 */
@Serializable
data class ProfileInput(
    val email: String,
    val name: String,
    val birthDate: String,
    val gender: String,
    val region: String,
) {
    override fun toString(): String = "ProfileInput[]"
}

/**
 * 인증 API 클라이언트 (KAN-224, 서버 KAN-223).
 *
 * 클라이언트를 둘 받는 이유: 로그인·갱신은 토큰 **없이** 나가야 하고, 내 정보·프로필·로그아웃은 Access
 * 토큰을 싣고 401이면 갱신해 다시 나가야 한다. 갱신 호출이 Bearer 인터셉터·Authenticator를 타면 갱신
 * 실패가 다시 갱신을 부르는 고리가 생긴다. [authedClient]를 만드는 곳은 [AuthClients]다.
 *
 * @param client 토큰 없는 호출용 (login·refresh)
 * @param authedClient Bearer + 자동 갱신 호출용 (me·updateProfile·logout)
 */
class AuthApi(
    baseUrl: String,
    private val client: OkHttpClient,
    private val authedClient: OkHttpClient,
) {

    private val baseUrl: HttpUrl = baseUrl.toHttpUrl()

    // encodeDefaults=false(기본)라 null 필드는 키째 빠진다 — 서버 검증이 `null`로 온 값과 없는 값을 다르게 볼 수 있다.
    private val json = Json { ignoreUnknownKeys = true }

    /**
     * 소셜 로그인 = 가입 겸용 (§3.9).
     *
     * @param privacyPolicyVersion 사용자가 동의한 개인정보처리방침 버전. 서버가 게시 중인 버전과 같아야 한다 (KAN-240).
     *   동의는 로그인 화면이 받으므로 이 호출은 늘 `privacyConsent: true`로 나간다 — 동의 없이 로그인
     *   버튼이 눌릴 수 없다는 것이 화면의 전제다. 기존 계정 재로그인에서는 서버가 두 값을 보지 않는다.
     */
    suspend fun login(credential: LoginCredential, privacyPolicyVersion: String): AuthResult<LoginSuccess> {
        val body = LoginBody(
            provider = credential.provider,
            idToken = credential.idToken,
            accessToken = credential.accessToken,
            refreshToken = credential.refreshToken,
            nonce = credential.nonce,
            user = credential.name?.let(::LoginUserBody),
            privacyConsent = true,
            privacyPolicyVersion = privacyPolicyVersion,
        )
        return call(client, post(PATH_LOGIN, json.encodeToString(LoginBody.serializer(), body))) { text ->
            json.decodeFromString(LoginResponseBody.serializer(), text).let {
                LoginSuccess(
                    tokens = AuthTokens(it.accessToken, it.refreshToken),
                    isNewUser = it.isNewUser,
                    account = Account(it.profileStatus, it.user),
                )
            }
        }
    }

    /** Refresh 회전 (§3.12). 성공하면 받은 쌍을 반드시 통째로 저장해야 한다 — 보낸 Refresh는 이미 죽었다. */
    suspend fun refresh(refreshToken: String): AuthResult<AuthTokens> =
        call(client, post(PATH_REFRESH, refreshBody(refreshToken))) { text ->
            json.decodeFromString(TokenResponseBody.serializer(), text).let {
                AuthTokens(it.accessToken, it.refreshToken)
            }
        }

    /** 내 계정과 프로필 완료 여부 (§3.11). */
    suspend fun me(): AuthResult<Account> =
        call(authedClient, request(PATH_ME).get().build(), ::decodeAccount)

    /** 추가 정보 입력 = 프로필 완료 (§3.10). 이미 완료된 프로필에 다시 부르면 값을 갱신한다. */
    suspend fun updateProfile(input: ProfileInput): AuthResult<Account> {
        val payload = json.encodeToString(ProfileInput.serializer(), input).toRequestBody(JSON_MEDIA_TYPE.toMediaType())
        return call(authedClient, request(PATH_PROFILE).put(payload).build(), ::decodeAccount)
    }

    /** 로그아웃 (§3.13) — 그 Refresh의 패밀리를 서버에서 폐기한다. 모르는 토큰도 204다. */
    suspend fun logout(refreshToken: String): AuthResult<Unit> =
        call(authedClient, post(PATH_LOGOUT, refreshBody(refreshToken))) { }

    private fun decodeAccount(text: String): Account = json.decodeFromString(Account.serializer(), text)

    private fun refreshBody(refreshToken: String): String =
        json.encodeToString(RefreshBody.serializer(), RefreshBody(refreshToken))

    private fun request(path: String): Request.Builder = Request.Builder()
        .url(baseUrl.newBuilder().addPathSegments(path).build())
        .header(HEADER_CORRELATION_ID, UUID.randomUUID().toString())

    private fun post(path: String, payload: String): Request =
        request(path).post(payload.toRequestBody(JSON_MEDIA_TYPE.toMediaType())).build()

    private suspend fun <T> call(
        client: OkHttpClient,
        request: Request,
        decode: (String) -> T,
    ): AuthResult<T> = try {
        client.await(request).use { response ->
            // 취소되면 읽는 스레드를 인터럽트해 본문 읽기를 끊는다 — 막힌 읽기는 그대로 기다려서 찔끔 흘리는
            // 응답이 로그아웃 상한을 무시했다(KAN-247 리뷰 재검증).
            val body = runInterruptible(Dispatchers.IO) { response.body.string() }
            val status = response.code
            if (status in 200..299) {
                // 성공 본문을 못 읽으면 세션 생성과 같은 규칙으로 재시도 가능한 거절이다. 본문은 토큰을
                // 담고 있을 수 있어 메시지에 싣지 않는다.
                runCatching { AuthResult.Success(decode(body)) }.getOrElse {
                    AuthResult.Rejected(status, null, "성공 응답($status) 본문을 읽지 못함", true, null)
                }
            } else {
                val envelope = decodeErrorEnvelope(body)
                AuthResult.Rejected(
                    status = status,
                    code = envelope?.code,
                    message = envelope?.message ?: "오류 봉투 없는 응답($status)",
                    retryable = envelope?.retryable ?: isRetryableStatus(status),
                    retryAfterMs = retryAfterMsOf(envelope, response.header(HEADER_RETRY_AFTER)),
                )
            }
        }
    } catch (e: IOException) {
        AuthResult.TransportError(e.message ?: e.javaClass.simpleName)
    }
}

/* 요청·응답 DTO. 토큰이나 개인 정보를 드는 것은 전부 toString을 가린다 — 로그·크래시에 실리면 안 된다. */

@Serializable
private data class LoginUserBody(val name: String) {
    override fun toString(): String = "LoginUserBody[]"
}

@Serializable
private data class LoginBody(
    val provider: Provider,
    val idToken: String? = null,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val nonce: String? = null,
    val user: LoginUserBody? = null,
    val privacyConsent: Boolean,
    val privacyPolicyVersion: String,
) {
    override fun toString(): String = "LoginBody[provider=$provider]"
}

@Serializable
private data class RefreshBody(val refreshToken: String) {
    override fun toString(): String = "RefreshBody[]"
}

@Serializable
private data class TokenResponseBody(val accessToken: String, val refreshToken: String) {
    override fun toString(): String = "TokenResponseBody[]"
}

@Serializable
private data class LoginResponseBody(
    val accessToken: String,
    val refreshToken: String,
    val isNewUser: Boolean,
    val profileStatus: ProfileStatus,
    val user: AuthUser,
) {
    override fun toString(): String = "LoginResponseBody[user=$user]"
}
