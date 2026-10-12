package com.accentury.app.learning

import com.accentury.app.audio.ClientQuality
import com.accentury.app.net.TransportFailure
import com.accentury.app.net.await
import com.accentury.app.net.decodeErrorEnvelope
import com.accentury.app.net.isRetryableStatus
import com.accentury.app.net.toTransportFailure
import com.accentury.app.upload.recordingMultipart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

// 서버 계약(명세 §3.19, 서버 KAN-267 IntonationScoringController)에 묶인 값들.
private const val PATH_INTONATION_CARDS = "v0/learning/intonation-cards"
private const val PATH_RECORDINGS = "recordings"
private const val HEADER_IDEMPOTENCY_KEY = "Idempotency-Key"
private const val HEADER_CORRELATION_ID = "X-Correlation-Id"

/** 레벨테스트 업로드와 같은 절대 상한 (UploadClient의 UPLOAD_CALL_TIMEOUT_SEC KDoc) */
private const val UPLOAD_CALL_TIMEOUT_SEC = 60L

/** 억양 녹음 업로드 한 번의 결말 (KAN-253, webview-bridge.md §12). */
sealed interface IntonationUploadResult {

    /** 202. 웹에는 [attemptId]만 넘긴다 — 폴링은 웹(KAN-254)이 한다. */
    data class Accepted(val attemptId: String) : IntonationUploadResult

    /** 서버가 답했지만 접수가 아니다. 401은 AuthClients의 갱신 1회·재시도 1회를 거친 뒤에도 401인 경우다. */
    data class Rejected(
        val status: Int,
        val code: String?,
        val message: String?,
        val retryable: Boolean,
    ) : IntonationUploadResult

    /** 응답 없는 전송 실패. 늘 재시도 가능하다. */
    data class TransportError(val failure: TransportFailure) : IntonationUploadResult
}

/**
 * `POST /v0/learning/intonation-cards/{cardId}/recordings` (KAN-253).
 *
 * [authedClient]는 `AuthClients.authedClient`다 — 계정 Access Bearer(AccessTokenInterceptor)와 401 → TokenRefresher 갱신 1회 →
 * 같은 요청 재시도 1회(TokenAuthenticator)가 이미 거기 있다(`com.accentury.app.auth.AuthClients`, §11과 같은 규칙). 레벨테스트 업로드처럼 세션 토큰을 손으로 싣지
 * 않는다 — 학습 API는 세션 토큰을 받으면 401이다. multipart 본문은 바이트 배열이라 재시도에서 다시 보낼 수 있다.
 */
class IntonationUploadClient(baseUrl: String, authedClient: OkHttpClient) {

    private val baseUrl: HttpUrl = baseUrl.toHttpUrl()

    // newBuilder는 인터셉터·Authenticator·디스패처를 그대로 물려받는다. 상한만 얹는다.
    private val client = authedClient.newBuilder().callTimeout(UPLOAD_CALL_TIMEOUT_SEC, TimeUnit.SECONDS).build()

    private val json = Json { ignoreUnknownKeys = true }

    suspend fun upload(
        cardId: String,
        idempotencyKey: String,
        wavBytes: ByteArray,
        durationMs: Long,
        clientQuality: ClientQuality,
    ): IntonationUploadResult = try {
        val url = baseUrl.newBuilder()
            .addPathSegments(PATH_INTONATION_CARDS)
            .addPathSegment(cardId)
            .addPathSegment(PATH_RECORDINGS)
            .build()
        val request = Request.Builder()
            .url(url)
            .post(recordingMultipart(wavBytes, durationMs, clientQuality))
            .header(HEADER_IDEMPOTENCY_KEY, idempotencyKey)
            .header(HEADER_CORRELATION_ID, UUID.randomUUID().toString())
            .build()
        client.await(request).use { response ->
            val body = withContext(Dispatchers.IO) { response.body.string() }
            toResult(response.code, body)
        }
    } catch (e: IOException) {
        IntonationUploadResult.TransportError(e.toTransportFailure())
    }

    private fun toResult(status: Int, body: String): IntonationUploadResult {
        if (status in 200..299) {
            val attemptId = runCatching { json.decodeFromString(AcceptedBody.serializer(), body).attemptId }
                .getOrNull()
                ?.takeIf { it.isNotBlank() }
            // 접수됐는데 id를 못 읽었다 — 같은 키로 다시 보내면 서버가 같은 시도를 돌려주므로 재시도로 회수된다.
            return attemptId?.let { IntonationUploadResult.Accepted(it) }
                ?: IntonationUploadResult.Rejected(status, null, null, retryable = true)
        }
        val envelope = decodeErrorEnvelope(body)
        return IntonationUploadResult.Rejected(
            status = status,
            code = envelope?.code,
            message = envelope?.message,
            retryable = envelope?.retryable ?: isRetryableStatus(status),
        )
    }
}

/** 202 본문 `{attemptId, contentVersion, cardId, status, pollAfterMs}` 중 읽는 것 (서버 IntonationUploadResponse). */
@Serializable
private data class AcceptedBody(val attemptId: String)
