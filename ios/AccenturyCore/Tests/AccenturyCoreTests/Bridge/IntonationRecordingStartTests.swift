import XCTest
@testable import AccenturyCore

/// 안드로이드 `bridge/IntonationRecordingStartTest.kt`의 이식본 (KAN-253, 9건).
final class IntonationRecordingStartTests: XCTestCase {

    private let guide = #"{"unit":"semitone","frameIntervalMs":50,"values":[0.0,null,1.5]}"#

    private func payload(
        cardId: String = "card_1",
        prompt: String = "어데 가노?",
        standard: String = #""어디 가니?""#,
        maxDurationMs: Int64 = 10_000,
        guideF0: String? = nil,
        itemNumber: Int = 2,
        totalItems: Int = 5
    ) -> String {
        #"{"cardId":"\#(cardId)","prompt":"\#(prompt)","standard":\#(standard),"maxDurationMs":\#(maxDurationMs),"guideF0":\#(guideF0 ?? guide),"#
            + #""itemNumber":\#(itemNumber),"totalItems":\#(totalItems)}"#
    }

    func test정상_payload를_그대로_읽는다() {
        XCTAssertEqual(
            IntonationRecordingStart(
                cardId: "card_1",
                prompt: "어데 가노?",
                standard: "어디 가니?",
                maxDurationMs: 10_000,
                guideF0: GuideF0(unit: "semitone", frameIntervalMs: 50, values: [0.0, nil, 1.5]),
                itemNumber: 2,
                totalItems: 5
            ),
            parseIntonationRecordingStart(payload())
        )
    }

    func testStandard_null은_유효하다_표준어_줄만_생략한다() throws {
        let start = try XCTUnwrap(parseIntonationRecordingStart(payload(standard: "null")))
        XCTAssertNil(start.standard)
    }

    func test웹이_모르는_필드를_더_보내도_읽는다() {
        XCTAssertNotNil(parseIntonationRecordingStart(String(payload().dropLast()) + #","seq":3}"#))
    }

    func test필수_필드가_빠지면_버린다() {
        XCTAssertNil(parseIntonationRecordingStart(#"{"prompt":"a","maxDurationMs":10000}"#))
        XCTAssertNil(parseIntonationRecordingStart(#"{"cardId":"c","maxDurationMs":10000}"#))
        XCTAssertNil(parseIntonationRecordingStart(#"{"cardId":"c","prompt":"a"}"#))
        XCTAssertNil(parseIntonationRecordingStart("not json"))
    }

    func test진행_정보가_빠지면_버린다() {
        // 5단계 필수 필드
        XCTAssertNil(parseIntonationRecordingStart(#"{"cardId":"c","prompt":"a","maxDurationMs":10000,"totalItems":3}"#))
        XCTAssertNil(parseIntonationRecordingStart(#"{"cardId":"c","prompt":"a","maxDurationMs":10000,"itemNumber":1}"#))
    }

    func test진행_정보가_범위_밖이면_버린다() {
        XCTAssertNil(parseIntonationRecordingStart(payload(itemNumber: 0)))
        XCTAssertNil(parseIntonationRecordingStart(payload(itemNumber: 6, totalItems: 5)))
        XCTAssertNil(parseIntonationRecordingStart(payload(itemNumber: 0, totalItems: 0)))
        XCTAssertNotNil(parseIntonationRecordingStart(payload(itemNumber: 5, totalItems: 5)))
    }

    func test빈_cardId_빈_대사_0_이하_녹음_길이는_버린다() {
        XCTAssertNil(parseIntonationRecordingStart(payload(cardId: " ")))
        XCTAssertNil(parseIntonationRecordingStart(payload(prompt: "")))
        XCTAssertNil(parseIntonationRecordingStart(payload(maxDurationMs: 0)))
    }

    func testGuideF0_형식이_어긋나면_곡선만_버리고_녹음은_연다() throws {
        let start = try XCTUnwrap(parseIntonationRecordingStart(payload(guideF0: #"{"unit":"semitone","values":"x"}"#)))
        XCTAssertNil(start.guideF0)
        XCTAssertEqual("card_1", start.cardId)
    }

    func testGuideF0가_없어도_유효하다() throws {
        let start = try XCTUnwrap(parseIntonationRecordingStart(#"{"cardId":"c","prompt":"a","standard":null,"maxDurationMs":10000,"itemNumber":1,"totalItems":1}"#))
        XCTAssertNil(start.guideF0)
    }
}
