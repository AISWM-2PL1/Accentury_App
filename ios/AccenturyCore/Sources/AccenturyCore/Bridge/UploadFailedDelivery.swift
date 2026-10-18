import Foundation

/// 재전송으로 풀리는 업로드 실패 하나 (KAN-288, webview-bridge.md §14). 웹 쪽 정본은 `bridge.ts`의 `UploadFailed`,
/// 안드로이드는 `bridge/UploadFailedDelivery.kt`다.
///
/// 실패 이유·문구는 싣지 않는다 — 웹이 그리는 것은 「전송 실패」와 [다시 보내기]뿐이고, 재녹음이 필요한
/// 거절(rerecord)·재시도 불가 실패(세션 만료 등)는 이 회신에 오지 않는다(기존 경로가 푼다).
public struct UploadFailed: Codable, Equatable, Sendable {
    public let itemId: String
    public let attemptId: String

    public init(itemId: String, attemptId: String) {
        self.itemId = itemId
        self.attemptId = attemptId
    }
}

/// `onUploadFailed` 주입 JS. 이스케이프는 ``webDeliveryJs(method:payloadJson:)``가 한다. 같은 실패를 여러 번 보내도 웹에는 무해하다.
public func uploadFailedDeliveryJs(_ failed: UploadFailed) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    // 문자열 두 필드라 인코딩이 실패할 수 없다 (intonationRecordedDeliveryJs와 같은 판단).
    let json = (try? encoder.encode(failed)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    return webDeliveryJs(method: "onUploadFailed", payloadJson: json)
}
