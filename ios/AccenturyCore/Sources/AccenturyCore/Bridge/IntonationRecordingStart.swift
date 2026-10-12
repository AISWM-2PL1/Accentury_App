import Foundation

/// 억양 학습 A-2의 [말해 보기] → 네이티브 녹음 화면(A-3)에 웹이 건네는 카드 컨텍스트 (KAN-253, webview-bridge.md §12).
/// 안드로이드 `bridge/IntonationRecordingStart.kt`의 이식본이고, 웹 쪽 정본은 `web/src/bridge/bridge.ts`의
/// `IntonationRecordingStart`다.
///
/// ``VoiceItemStart``와 달리 문항 번호·문항 수가 없다 — 학습은 레벨테스트 세션이 없고 카드 식별은 `cardId` 하나다.
///
/// - `cardId`: 서버 카드 id. 업로드 경로에 그대로 쓴다
/// - `standard`: 표준어 원문. nil이면 그 줄을 그리지 않는다
/// - `guideF0`: ``VoiceItemStart/guideF0``와 같은 형식·같은 렌더 규칙
public struct IntonationRecordingStart: Codable, Equatable, Sendable {
    public let cardId: String
    public let prompt: String
    public let standard: String?
    public let maxDurationMs: Int64
    public let guideF0: GuideF0?

    public init(cardId: String, prompt: String, standard: String?, maxDurationMs: Int64, guideF0: GuideF0? = nil) {
        self.cardId = cardId
        self.prompt = prompt
        self.standard = standard
        self.maxDurationMs = maxDurationMs
        self.guideF0 = guideF0
    }
}

/// 웹이 보낸 JSON을 ``IntonationRecordingStart``로 좁힌다. 신뢰할 수 없으면 nil이다.
///
/// ``parseVoiceItemStart(_:)``와 같은 규칙이다 — 빈 cardId는 업로드 경로를 만들 수 없고, 0 이하의 녹음 길이는 녹음
/// 화면이 그릴 수 없다. 빈 대사도 끊는다: 읽을 문장이 없는 녹음 화면은 사용자가 무엇을 해야 할지 모른다. guideF0만
/// 불량이면 곡선만 버린다(곡선은 서버 카드 데이터라 그 한 줄이 녹음 전체를 막으면 안 된다).
public func parseIntonationRecordingStart(_ payloadJson: String) -> IntonationRecordingStart? {
    guard let start = decodeTolerantOfGuide(payloadJson, as: IntonationRecordingStart.self) else { return nil }
    if start.cardId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return nil }
    if start.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return nil }
    if start.maxDurationMs <= 0 { return nil }
    return start
}
