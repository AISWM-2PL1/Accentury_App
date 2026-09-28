package com.accentury.app.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

private const val STATUS_REQUEST_TIMEOUT = 408
private const val STATUS_TOO_MANY_REQUESTS = 429

private val envelopeJson = Json { ignoreUnknownKeys = true }

/**
 * 서버 공통 오류 봉투 (API 명세서 §2.4).
 *
 * 여기 있는 이유: 세션 생성(KAN-34)만 읽던 봉투를 인증 API(KAN-224)도 똑같이 읽는다. 봉투를 못 읽을 때
 * 상태 코드와 Retry-After 헤더로 메우는 규칙까지 두 벌로 갈라지면 같은 429가 화면마다 다르게 안내된다.
 */
@Serializable
internal data class ErrorEnvelope(
    val code: String? = null,
    val message: String? = null,
    val retryable: Boolean,
    val retryAfterMs: Long? = null,
    val correlationId: String? = null,
)

/** 봉투가 아닌 본문(프록시의 HTML 오류 페이지 등)이면 null. */
internal fun decodeErrorEnvelope(body: String): ErrorEnvelope? =
    runCatching { envelopeJson.decodeFromString(ErrorEnvelope.serializer(), body) }.getOrNull()

/** 봉투가 없으면 재시도 여부를 서버가 알려주지 않으므로 상태 코드로 판단한다. */
internal fun isRetryableStatus(status: Int): Boolean =
    status >= 500 || status == STATUS_REQUEST_TIMEOUT || status == STATUS_TOO_MANY_REQUESTS

/**
 * 서버는 429에 봉투의 retryAfterMs와 Retry-After 헤더(초)를 함께 보낸다 (GlobalExceptionHandler).
 * 봉투를 못 읽는 응답에서도 대기 시간 안내를 살리려고 헤더를 예비로 읽는다 — 헤더가 HTTP-date 꼴이면
 * 숫자로 읽히지 않아 null이 된다.
 */
internal fun retryAfterMsOf(envelope: ErrorEnvelope?, retryAfterHeader: String?): Long? =
    envelope?.retryAfterMs ?: retryAfterHeader?.toLongOrNull()?.times(1_000)
