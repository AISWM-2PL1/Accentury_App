package com.accentury.app.bridge

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * 레벨 테스트 업로드 실패 하나 (KAN-288, webview-bridge.md §14). 웹 쪽 정본은 `bridge.ts`의 `UploadFailed`다.
 *
 * 실패 이유·문구는 싣지 않는다 — 웹이 그리는 것은 「전송 실패」와, [retryable]일 때만 [다시 보내기]다. 재시도 불가
 * 실패(세션 만료·시도 상한)도 싣는 이유: 예전 상태 바가 보여 주던 실패 표시가 사라져, 빼면 사용자가 대기 문구 앞에서
 * 멈춘 까닭을 모른다 (PR #38 리뷰 P1). 재녹음이 필요한 거절(rerecord)은 오지 않는다 — 네이티브가 녹음 화면을 다시 연다.
 */
@Serializable
data class UploadFailed(val itemId: String, val attemptId: String, val retryable: Boolean)

/** `onUploadFailed` 주입 JS. 이스케이프는 [webDeliveryJs]가 한다. 같은 실패를 여러 번 보내도 웹에는 무해하다. */
fun uploadFailedDeliveryJs(failed: UploadFailed): String =
    webDeliveryJs(method = "onUploadFailed", payloadJson = Json.encodeToString(UploadFailed.serializer(), failed))
