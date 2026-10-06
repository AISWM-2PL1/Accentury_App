package com.accentury.app.session

import com.accentury.app.net.await
import com.accentury.app.net.decodeErrorEnvelope
import com.accentury.app.net.isRetryableStatus
import com.accentury.app.net.retryAfterMsOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
import java.util.concurrent.TimeUnit

// 서버 계약(API 명세서 §3.1 / KAN-9)에 묶인 값들. 계약이 바뀌면 여기만 고친다.
private const val PATH_SESSIONS = "v0/sessions"
private const val PLATFORM_ANDROID = "ANDROID"
private const val JSON_MEDIA_TYPE = "application/json"
private const val HEADER_CORRELATION_ID = "X-Correlation-Id"
private const val HEADER_RETRY_AFTER = "Retry-After"

/**
 * 세션 생성 한 건의 절대 상한.
 *
 * 업로드(60초)보다 훨씬 짧게 잡는다. 올릴 본문이 없어 저속망에서도 오래 걸릴 이유가 없고,
 * 그동안 사용자는 [시작하기]를 누른 채 아무것도 없는 준비 화면을 보고 있다 — 여기서 기다리는
 * 시간은 "진입 → 결과 3분" 예산에서 통째로 빠지는 시간이다. 넘기면 IOException으로 끊어
 * 실패 화면의 [다시 시도]가 받게 한다.
 */
private const val CREATE_CALL_TIMEOUT_SEC = 15L

/**
 * 세션 생성에 쓸 클라이언트 — [base]에 [CREATE_CALL_TIMEOUT_SEC] 상한만 얹는다.
 *
 * 로그인한 앱은 [base]로 인증 클라이언트(`AuthClients.authedClient`, KAN-224)를 넘긴다. newBuilder라
 * Bearer 인터셉터·Authenticator·디스패처는 그대로 물려받고 상한만 세션 생성용으로 좁혀진다.
 */
fun sessionCreationClient(base: OkHttpClient = OkHttpClient()): OkHttpClient = base.newBuilder()
    .callTimeout(CREATE_CALL_TIMEOUT_SEC, TimeUnit.SECONDS)
    .build()

/** 세션 생성 한 번의 결과. 판정(무엇을 보여줄지)은 [SessionGateController]가 한다. */
sealed interface SessionResult {

    data class Created(val session: Session) : SessionResult

    /**
     * 서버가 응답은 했지만 세션을 주지 않았다. 필드는 공통 오류 봉투(§2.4) 그대로다.
     *
     * @property retryAfterMs 429가 알려주는 대기 시간 (§2.5). 그 외에는 null이다
     */
    data class Rejected(
        val code: String?,
        val message: String?,
        val retryable: Boolean,
        val retryAfterMs: Long?,
    ) : SessionResult

    /** 응답이 아예 오지 않은 전송 실패. 의미상 항상 재시도 가능. */
    data class TransportError(val reason: String) : SessionResult
}

/**
 * `POST /v0/sessions` 클라이언트 (KAN-34 결선, KAN-9 계약).
 *
 * [previousToken]이 이 인터페이스에 있는 이유: 재응시도 같은 호출이다 (KAN-107, §3.1). 이전 세션의
 * 토큰을 함께 보내면 서버가 그 세션과 결과를 즉시 폐기하고 새 세션을 발급한다. 최초 응시와
 * 재응시가 다른 메서드로 갈리면 본문 필드 하나 차이인 두 경로가 따로 늙으므로 파라미터로 둔다.
 *
 * 로그인한 앱(KAN-224)은 이 호출에 `Authorization: Bearer <Access JWT>`를 싣는다. 헤더는 인증
 * 클라이언트의 인터셉터가 붙이고([sessionCreationClient]) 이 클래스는 모른다 — 익명과 로그인이
 * 같은 코드를 탄다. 계정 세션의 출신지역은 서버가 계정 값으로 채우므로 `region`은 보내지 않는다(익명 세션만 싣는다,
 * KAN-270 7단계).
 * 서버가 403 `AUTH_PROFILE_INCOMPLETE`를 주면 [SessionResult.Rejected]로 올라오고, 추가 정보
 * 화면으로 돌리는 판정은 호출부(`AuthGateController.onProfileIncomplete`)가 한다.
 */
interface SessionClient {
    /**
     * @param appVersion 익명 집계용 앱 버전 (서버 상한 32자)
     * @param previousToken 재응시일 때 폐기할 이전 세션의 토큰. 최초 응시는 null
     * @param campaignToken App Link로 들어온 공유 유입 계측 코드 (KAN-32). 링크 진입이 아니면 null
     * @param voiceConsentVersion 익명 모드에서 음성 저장에 동의했을 때의 문안 버전 (KAN-270 5단계). 서버는 계정 세션에서는
     *   이 필드를 무시한다 — 계정 모드는 null로 둔다. 미동의도 null
     * @param region 익명 모드의 출신 지역 코드 (KAN-270 7단계). 동의하고 지역을 골랐을 때만 — 계정 모드·미동의는 null
     */
    suspend fun create(
        appVersion: String,
        previousToken: String? = null,
        campaignToken: String? = null,
        voiceConsentVersion: String? = null,
        region: String? = null,
    ): SessionResult
}

/** 동의 버전이 서버 게시 버전과 어긋났을 때 서버가 주는 코드 (§2.4) */
internal const val CODE_VALIDATION_FAILED = "VALIDATION_FAILED"

/**
 * 세션 생성 + 동의 버전 폴백 (KAN-270 5단계, 웹 `App.tsx` startStandaloneTest와 같은 규칙).
 *
 * 동의를 실었는데 400 `VALIDATION_FAILED`면 이 빌드의 문안 버전이 서버 게시 버전보다 낡았다(서버가 버전을 먼저 올린
 * 배포 사이). 동의 없이 **한 번만** 다시 만든다 — 선택 동의 하나 때문에 응시가 막히면 안 된다(팀 결정 2026-10-06).
 * 이전 토큰은 그대로 싣는다: 400은 본문 검증에서 나므로 서버가 옛 세션을 폐기하기 전이고, 두 번째 요청이 그 폐기를
 * 다시 맡는다. 미동의 요청의 400이나 다른 거절은 그대로 돌려준다.
 *
 * 재시도에서는 [region]도 뺀다(KAN-270 7단계) — 동의 없는 세션의 음성은 저장되지 않으니 라벨만 남길 이유가 없다.
 * 웹 `App.tsx`는 region을 유지하지만 웹의 region은 staging 전용 라벨 수집이라 동의와 무관하게 실린다.
 */
suspend fun SessionClient.createWithConsentFallback(
    appVersion: String,
    previousToken: String?,
    campaignToken: String?,
    voiceConsentVersion: String?,
    region: String? = null,
): SessionResult {
    val first = create(appVersion, previousToken, campaignToken, voiceConsentVersion, region)
    val retry = voiceConsentVersion != null &&
        first is SessionResult.Rejected && first.code == CODE_VALIDATION_FAILED
    return if (retry) create(appVersion, previousToken, campaignToken, voiceConsentVersion = null, region = null) else first
}

class OkHttpSessionClient(
    baseUrl: String,
    private val client: OkHttpClient = sessionCreationClient(),
) : SessionClient {

    private val baseUrl: HttpUrl = baseUrl.toHttpUrl()

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun create(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?,
        region: String?,
    ): SessionResult = try {
        client.await(buildRequest(appVersion, previousToken, campaignToken, voiceConsentVersion, region)).use { response ->
            val body = withContext(Dispatchers.IO) { response.body.string() }
            toResult(response.code, body, response.header(HEADER_RETRY_AFTER))
        }
    } catch (e: IOException) {
        SessionResult.TransportError(e.message ?: e.javaClass.simpleName)
    }

    private fun buildRequest(
        appVersion: String,
        previousToken: String?,
        campaignToken: String?,
        voiceConsentVersion: String?,
        region: String?,
    ): Request {
        val url = baseUrl.newBuilder().addPathSegments(PATH_SESSIONS).build()
        /*
         * 바디 전체가 선택이지만(§3.1) client는 채워 보낸다 — 익명 집계가 플랫폼별 응시·완주를
         * 가르는 유일한 입력이다.
         *
         * campaignToken은 App Link가 준 링크 진입에만 실린다 (KAN-32). 앱이 세션을 직접 만들므로
         * (KAN-34) 진입 URL의 `?c=`만으로는 서버 세션에 유입 경로가 남지 않는다 — 웹이 세션을 만들 때
         * 하던 일을 이 자리가 대신한다. 링크 진입이 아니면 키 자체를 빼고 보낸다: kotlinx 기본이
         * encodeDefaults=false라 null 필드는 직렬화되지 않고(웹 webSession.ts도 같은 방식이다),
         * 서버 `@Pattern`은 없는 필드는 보지만 `null`로 온 값에는 걸릴 수 있다.
         */
        val payload = json.encodeToString(
            CreateSessionBody.serializer(),
            CreateSessionBody(
                campaignToken = campaignToken,
                previousSessionToken = previousToken,
                voiceConsentVersion = voiceConsentVersion,
                region = region,
                client = ClientBody(platform = PLATFORM_ANDROID, appVersion = appVersion),
            ),
        )
        return Request.Builder()
            .url(url)
            .post(payload.toRequestBody(JSON_MEDIA_TYPE.toMediaType()))
            .header(HEADER_CORRELATION_ID, UUID.randomUUID().toString())
            .build()
    }

    private fun toResult(status: Int, body: String, retryAfterHeader: String?): SessionResult {
        if (status in 200..299) {
            // 계약상 201이지만 다른 2xx도 6필드가 온전하면 받아들인다.
            // 세트가 1 미만이면 받지 않는다 (KAN-205) - 그런 세션은 웹이 조회할 정의가 없다.
            val created = runCatching { json.decodeFromString(CreatedBody.serializer(), body) }
                .getOrNull()
                ?.takeIf {
                    it.sessionId.isNotBlank() && it.sessionToken.isNotBlank() &&
                        it.testVersion.isNotBlank() && it.voiceSet >= 1
                }
            return if (created != null) {
                SessionResult.Created(
                    Session(
                        sessionId = created.sessionId,
                        sessionToken = created.sessionToken,
                        testVersion = created.testVersion,
                        voiceSet = created.voiceSet,
                        scoreVersion = created.scoreVersion,
                        expiresAt = created.expiresAt,
                    ),
                )
            } else {
                // 서버에는 세션이 생겼는데 우리는 쓸 수 없다. 다시 부르면 새 세션이 생기므로
                // 재시도 가능이다 — 버려진 세션은 아무 데이터도 달리지 않은 채 30분 뒤 만료된다.
                SessionResult.Rejected(
                    code = null,
                    message = "성공 응답($status) 본문에서 세션 값을 읽지 못함",
                    retryable = true,
                    retryAfterMs = null,
                )
            }
        }
        val envelope = decodeErrorEnvelope(body)
        return SessionResult.Rejected(
            code = envelope?.code,
            message = envelope?.message ?: "오류 봉투 없는 응답($status)",
            retryable = envelope?.retryable ?: isRetryableStatus(status),
            retryAfterMs = retryAfterMsOf(envelope, retryAfterHeader),
        )
    }
}

/**
 * 요청 바디 (§3.1). 모든 필드가 선택이라 서버는 바디 자체가 없어도 세션을 만든다.
 *
 * [previousSessionToken]은 재응시에서 폐기할 이전 세션 토큰이다 (KAN-107). 예전에는 `Authorization:
 * Bearer st_...` 헤더로 보냈지만 로그인한 앱은 그 헤더를 Access 토큰이 차지한다 (KAN-224) — 서버는
 * 본문 값이 있으면 헤더의 `st_` 토큰보다 우선해 읽는다 (Accentury_Server
 * `backend/.../session/SessionService.java` create()의 bodyRetakeToken). 익명·로그인 모두 본문으로 보내
 * 경로를 하나로 둔다. 만료됐거나 서버가 모르는 토큰은 조용히 무시되고 응답이 최초 응시와 구분되지
 * 않으므로(401도 404도 없다) 여기서 토큰의 생사를 따지지 않는다. null이면 키째 빠진다.
 *
 * [voiceConsentVersion]은 익명 모드의 음성 저장 동의다 (KAN-270 5단계, 웹 webSession.ts와 같은 필드). 역시 null이면 빠진다.
 * [region]은 익명 모드의 출신 지역 코드다 (KAN-270 7단계). 서버가 S3 키·학습 라벨에 쓴다. null이면 빠진다.
 */
@Serializable
private data class CreateSessionBody(
    val campaignToken: String? = null,
    val previousSessionToken: String? = null,
    val voiceConsentVersion: String? = null,
    val region: String? = null,
    val client: ClientBody,
) {
    // 이전 세션 토큰이 로그에 찍히지 않게 한다 (KAN-224).
    override fun toString(): String = "CreateSessionBody[client=$client]"
}

@Serializable
private data class ClientBody(val platform: String, val appVersion: String)

/** 201 응답 6필드 (§3.1). 하나라도 빠지면 파싱이 실패해 재시도 가능한 거절이 된다. */
@Serializable
private data class CreatedBody(
    val sessionId: String,
    val sessionToken: String,
    val testVersion: String,
    val voiceSet: Int,
    val scoreVersion: String,
    val expiresAt: String,
)
