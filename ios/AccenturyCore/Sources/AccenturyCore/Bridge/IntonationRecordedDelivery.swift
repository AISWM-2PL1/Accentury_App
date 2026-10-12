import Foundation

/// 억양 녹음 업로드 202 접수 회신 (KAN-253, webview-bridge.md §12). 웹 쪽 정본은 `bridge.ts`의 `IntonationRecorded`다.
public struct IntonationRecorded: Codable, Equatable, Sendable {
    public let cardId: String
    public let attemptId: String

    public init(cardId: String, attemptId: String) {
        self.cardId = cardId
        self.attemptId = attemptId
    }
}

/// `onIntonationRecorded` 주입 JS. **성공만 회신한다** — 업로드 실패·녹음 화면 닫기는 회신이 없다(§12).
/// 이스케이프는 ``webDeliveryJs(method:payloadJson:)``가 한다. 웹은 지금 카드의 cardId가 아닌 회신을 버리므로 cardId를 그대로 싣는다.
public func intonationRecordedDeliveryJs(_ recorded: IntonationRecorded) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    // 문자열 두 필드라 인코딩이 실패할 수 없다 (ItemResult.toJson과 같은 판단).
    let json = (try? encoder.encode(recorded)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    return webDeliveryJs(method: "onIntonationRecorded", payloadJson: json)
}
