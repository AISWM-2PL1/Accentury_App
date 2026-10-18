import XCTest
@testable import AccenturyCore

/// 안드로이드 `bridge/UploadFailedDeliveryTest.kt`의 이식본 (KAN-288 6단계).
final class UploadFailedDeliveryTests: XCTestCase {

    /// 생성된 JS의 문자열 리터럴을 웹처럼 풀어 JSON 객체로 되돌린다 (IntonationRecordedDeliveryTests와 같은 경계 문구).
    private func decodePayload(_ js: String) throws -> [String: Any] {
        let prefix = try XCTUnwrap(js.range(of: "return false;f("))
        let suffix = try XCTUnwrap(js.range(of: ");return true;})()", options: .backwards))
        let literal = String(js[prefix.upperBound..<suffix.lowerBound])
        let json = try XCTUnwrap((try JSONSerialization.jsonObject(with: Data("[\(literal)]".utf8)) as? [String])?.first)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
    }

    func testOnUploadFailed_슬롯으로_itemId_attemptId_두_필드만_간다() throws {
        let js = uploadFailedDeliveryJs(UploadFailed(itemId: "item_3", attemptId: "at_9"))

        XCTAssertTrue(js.contains("window.AccenturyWeb.onUploadFailed"))
        let decoded = try decodePayload(js)
        XCTAssertEqual(Set(["itemId", "attemptId"]), Set(decoded.keys))
        XCTAssertEqual("item_3", decoded["itemId"] as? String)
        XCTAssertEqual("at_9", decoded["attemptId"] as? String)
    }
}
