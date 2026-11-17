import XCTest
@testable import AccenturyCore

/// 대사 카드 캡션 (KAN-161 4단계, KAN-355 4단계 보완). 안드로이드 `recording/PromptCaptionTest.kt`의 이식본.
///
/// 진행 번호는 카드 바로 위 진행 표시(「억양 … 2 / 7」)가 맡는다 — 캡션에 번호가 다시 붙으면 한 화면에 같은 숫자가 두 번 보인다.
final class PromptCaptionTests: XCTestCase {

    func test캡션은_안내만_남기고_진행_번호를_싣지_않는다_KAN355() {
        XCTAssertEqual("이 문장을 읽어주세요", promptCaption)
        XCTAssertNil(promptCaption.rangeOfCharacter(from: .decimalDigits))
        XCTAssertFalse(promptCaption.contains("/"))
    }

    func test감정_칩_emotion이_있으면_앞뒤_공백을_걷고_문구를_붙인다_KAN283() {
        XCTAssertEqual("부탁하는 느낌으로 말해 주세요", emotionCue("부탁하는"))
        XCTAssertEqual("다급한 느낌으로 말해 주세요", emotionCue("  다급한 "))
    }

    func test감정_칩_nil_빈_문자열_공백뿐이면_칩_없음_KAN283() {
        XCTAssertNil(emotionCue(nil))
        XCTAssertNil(emotionCue(""))
        XCTAssertNil(emotionCue("  "))
    }

    func test긴_대사_두_줄_분량을_넘으면_26으로_줄인다_KAN355() {
        // 시안 s-06의 긴 문항(37자)은 26, s-17의 짧은 대사와 목소리 점검은 30
        XCTAssertTrue(isLongPrompt("처마가 길게 뻗어서 햇빛도 막아 주고, 비도 막아 주이까네 참 좋아예."))
        XCTAssertFalse(isLongPrompt("밥 뭇나?"))
        XCTAssertFalse(isLongPrompt("안녕하세요"))
    }

    func test긴_대사_경계는_20자_앞뒤_공백은_세지_않는다_KAN355() {
        XCTAssertFalse(isLongPrompt(String(repeating: "가", count: 20)))
        XCTAssertTrue(isLongPrompt(String(repeating: "가", count: 21)))
        XCTAssertFalse(isLongPrompt("  " + String(repeating: "가", count: 20) + "\n"))
    }
}
