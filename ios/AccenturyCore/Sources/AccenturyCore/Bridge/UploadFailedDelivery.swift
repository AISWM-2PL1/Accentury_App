import Foundation

/// 레벨 테스트 업로드 실패 하나 (KAN-288, webview-bridge.md §14). 웹 쪽 정본은 `bridge.ts`의 `UploadFailed`,
/// 안드로이드는 `bridge/UploadFailedDelivery.kt`다.
///
/// 실패 이유·문구는 싣지 않는다 — 웹이 그리는 것은 「전송 실패」와, `retryable`일 때만 [다시 보내기]다. 재시도 불가
/// 실패(세션 만료·시도 상한)도 싣는 이유: 예전 상태 바가 보여 주던 실패 표시가 사라져, 빼면 사용자가 대기 문구 앞에서
/// 멈춘 까닭을 모른다 (PR #38 리뷰 P1). 재녹음이 필요한 거절(rerecord)은 오지 않는다 — 네이티브가 녹음 화면을 다시 연다.
public struct UploadFailed: Codable, Equatable, Sendable {
    public let itemId: String
    public let attemptId: String
    public let retryable: Bool

    public init(itemId: String, attemptId: String, retryable: Bool) {
        self.itemId = itemId
        self.attemptId = attemptId
        self.retryable = retryable
    }
}

/// `onUploadFailed` 주입 JS. 이스케이프는 ``webDeliveryJs(method:payloadJson:)``가 한다. 같은 실패를 여러 번 보내도 웹에는 무해하다.
public func uploadFailedDeliveryJs(_ failed: UploadFailed) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    // 문자열·불리언 필드뿐이라 인코딩이 실패할 수 없다 (intonationRecordedDeliveryJs와 같은 판단).
    let json = (try? encoder.encode(failed)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    return webDeliveryJs(method: "onUploadFailed", payloadJson: json)
}
