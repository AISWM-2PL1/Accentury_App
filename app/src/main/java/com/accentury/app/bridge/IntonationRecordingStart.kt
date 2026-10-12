package com.accentury.app.bridge

import kotlinx.serialization.Serializable

/**
 * 억양 학습 카드 진입(웹 자동 호출)·일시정지 A-2의 [다시 말해 보기] → 네이티브 녹음 화면(A-3)에 웹이 건네는 카드
 * 컨텍스트 (KAN-253, webview-bridge.md §12). 웹 쪽 정본은 `web/src/bridge/bridge.ts`의 `IntonationRecordingStart`다.
 *
 * @property cardId 서버 카드 id. 업로드 경로에 그대로 쓴다
 * @property standard 표준어 원문. null이면 그 줄을 그리지 않는다
 * @property guideF0 [VoiceItemStart.guideF0]와 같은 형식·같은 렌더 규칙
 * @property itemNumber 코스 안 몇 번째 카드인지(1부터). 녹음 대기 화면이 A-2 카드 역할을 해 `n / N`을 그린다 (5단계)
 * @property totalItems 코스의 카드 수
 */
@Serializable
data class IntonationRecordingStart(
    val cardId: String,
    val prompt: String,
    val standard: String? = null,
    val maxDurationMs: Long,
    val guideF0: GuideF0? = null,
    val itemNumber: Int,
    val totalItems: Int,
)

/**
 * 웹이 보낸 JSON을 [IntonationRecordingStart]로 좁힌다. 신뢰할 수 없으면 null이다.
 *
 * [parseVoiceItemStart]와 같은 규칙이다 — 빈 cardId는 업로드 경로를 만들 수 없고, 0 이하의 녹음 길이는 녹음 화면이
 * 그릴 수 없다. 빈 대사도 끊는다: 읽을 문장이 없는 녹음 화면은 사용자가 무엇을 해야 할지 모른다. guideF0만 불량이면
 * 곡선만 버린다(곡선은 서버 카드 데이터라 그 한 줄이 녹음 전체를 막으면 안 된다).
 * 진행 정보는 [parseVoiceItemStart]와 같이 1 ≤ itemNumber ≤ totalItems가 아니면 끊는다 — 누락도 디코딩에서 끊긴다.
 */
fun parseIntonationRecordingStart(payloadJson: String): IntonationRecordingStart? {
    val start = decodeTolerantOfGuide(payloadJson, IntonationRecordingStart.serializer()) ?: return null
    if (start.cardId.isBlank() || start.prompt.isBlank()) return null
    if (start.maxDurationMs <= 0) return null
    if (start.itemNumber < 1 || start.itemNumber > start.totalItems) return null
    return start
}
