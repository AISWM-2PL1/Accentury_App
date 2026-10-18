package com.accentury.app.bridge

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * 재전송으로 풀리는 업로드 실패 하나 (KAN-288, webview-bridge.md §14). 웹 쪽 정본은 `bridge.ts`의 `UploadFailed`다.
 *
 * 실패 이유·문구는 싣지 않는다 — 웹이 그리는 것은 「전송 실패」와 [다시 보내기]뿐이고, 재녹음이 필요한
 * 거절(rerecord)·재시도 불가 실패(세션 만료 등)는 이 회신에 오지 않는다(기존 경로가 푼다).
 */
@Serializable
data class UploadFailed(val itemId: String, val attemptId: String)

/** `onUploadFailed` 주입 JS. 이스케이프는 [webDeliveryJs]가 한다. 같은 실패를 여러 번 보내도 웹에는 무해하다. */
fun uploadFailedDeliveryJs(failed: UploadFailed): String =
    webDeliveryJs(method = "onUploadFailed", payloadJson = Json.encodeToString(UploadFailed.serializer(), failed))
