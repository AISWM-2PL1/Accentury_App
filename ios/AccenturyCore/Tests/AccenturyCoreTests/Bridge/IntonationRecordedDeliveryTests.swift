import XCTest
@testable import AccenturyCore

/// 안드로이드 `bridge/IntonationRecordedDeliveryTest.kt`의 이식본 (KAN-253, 3건).
final class IntonationRecordedDeliveryTests: XCTestCase {

    /// 생성된 JS의 문자열 리터럴을 웹처럼 풀어 JSON 객체로 되돌린다 (ItemResultDeliveryTests와 같은 경계 문구).
    private func decodePayload(_ js: String) throws -> [String: Any] {
        let prefix = try XCTUnwrap(js.range(of: "return false;f("))
        let suffix = try XCTUnwrap(js.range(of: ");return true;})()", options: .backwards))
        let literal = String(js[prefix.upperBound..<suffix.lowerBound])
        let json = try XCTUnwrap((try JSONSerialization.jsonObject(with: Data("[\(literal)]".utf8)) as? [String])?.first)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
    }

    func testOnIntonationRecorded_슬롯으로_간다() {
        let js = intonationRecordedDeliveryJs(IntonationRecorded(cardId: "card_1", attemptId: "la_1"))
        XCTAssertTrue(js.contains("window.AccenturyWeb.onIntonationRecorded"))
    }

    func testPayload는_cardId_attemptId_두_필드뿐이다() throws {
        let decoded = try decodePayload(intonationRecordedDeliveryJs(IntonationRecorded(cardId: "card_1", attemptId: "la_abc")))
        XCTAssertEqual(Set(["cardId", "attemptId"]), Set(decoded.keys))
        XCTAssertEqual("card_1", decoded["cardId"] as? String)
        XCTAssertEqual("la_abc", decoded["attemptId"] as? String)
    }

    func test따옴표_줄_종결자가_든_값도_주입_JS를_깨지_않는다() throws {
        let js = intonationRecordedDeliveryJs(IntonationRecorded(cardId: "c\"'\u{2028}", attemptId: "la_1"))
        XCTAssertFalse(js.contains("\u{2028}"))
        XCTAssertEqual("c\"'\u{2028}", try decodePayload(js)["cardId"] as? String)
    }
}
