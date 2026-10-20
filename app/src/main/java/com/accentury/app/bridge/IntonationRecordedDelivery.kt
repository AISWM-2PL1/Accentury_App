package com.accentury.app.bridge

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** 억양 녹음 업로드 202 접수 회신 (KAN-253, webview-bridge.md §12). 웹 쪽 정본은 `bridge.ts`의 `IntonationRecorded`다. */
@Serializable
data class IntonationRecorded(val cardId: String, val attemptId: String)

/**
 * `onIntonationRecorded` 주입 JS. **성공만 회신한다** — 업로드 실패·녹음 화면 닫기는 회신이 없다(§12).
 * 이스케이프는 [webDeliveryJs]가 한다. 웹은 지금 카드의 cardId가 아닌 회신을 버리므로 cardId를 그대로 싣는다.
 */
fun intonationRecordedDeliveryJs(recorded: IntonationRecorded): String =
    webDeliveryJs(method = "onIntonationRecorded", payloadJson = Json.encodeToString(IntonationRecorded.serializer(), recorded))
