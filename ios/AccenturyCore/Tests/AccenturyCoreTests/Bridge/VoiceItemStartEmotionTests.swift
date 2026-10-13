import XCTest
@testable import AccenturyCore

/// startVoiceItem의 emotion (KAN-283). 안드로이드 `bridge/VoiceItemStartEmotionTest.kt`의 이식본.
/// guideF0처럼 선택 필드라, 없거나 깨져도 문항은 살아야 한다 — 칩 한 줄 때문에 녹음 화면이 안 뜨면 안 된다.
final class VoiceItemStartEmotionTests: XCTestCase {

    private func payload(emotionJson: String?, guideJson: String? = nil) -> String {
        var s = "{\"itemId\":\"v1\",\"prompt\":\"밥 묵었나\",\"itemNumber\":1,\"totalItems\":7,\"maxDurationMs\":10000"
        if let emotionJson { s += ",\"emotion\":\(emotionJson)" }
        if let guideJson { s += ",\"guideF0\":\(guideJson)" }
        return s + "}"
    }

    func testEmotion이_있으면_정의_값_그대로_받는다() {
        XCTAssertEqual("부탁하는", parseVoiceItemStart(payload(emotionJson: "\"부탁하는\""))?.emotion)
    }

    func test키가_없으면_nil_구버전_웹과_emotion_없는_정의() {
        let start = parseVoiceItemStart(payload(emotionJson: nil))
        XCTAssertNotNil(start)
        XCTAssertNil(start?.emotion)
    }

    func test빈_문자열은_그대로_받는다_칩_여부는_화면이_가른다() {
        XCTAssertEqual("", parseVoiceItemStart(payload(emotionJson: "\"\""))?.emotion)
    }

    func testEmotion_타입이_어긋나도_문항은_살리고_emotion만_버린다() {
        for bad in ["123", "{}", "[\"부탁하는\"]", "true"] {
            let start = parseVoiceItemStart(payload(emotionJson: bad))
            XCTAssertNotNil(start, "emotion=\(bad) 에서 문항이 거부됐다")
            XCTAssertNil(start?.emotion, "emotion=\(bad) 가 살아남았다")
        }
    }

    func testGuideF0가_깨져도_멀쩡한_emotion은_남는다() {
        let start = parseVoiceItemStart(payload(emotionJson: "\"다급한\"", guideJson: "\"곡선 아님\""))
        XCTAssertNotNil(start)
        XCTAssertNil(start?.guideF0)
        XCTAssertEqual("다급한", start?.emotion)
    }

    func testEmotion이_깨져도_멀쩡한_guideF0는_남는다() {
        let guide = "{\"unit\":\"semitone\",\"frameIntervalMs\":10,\"values\":[0.0,null,1.5]}"
        let start = parseVoiceItemStart(payload(emotionJson: "{}", guideJson: guide))
        XCTAssertNotNil(start)
        XCTAssertNil(start?.emotion)
        XCTAssertEqual(3, start?.guideF0?.values.count)
    }
}
