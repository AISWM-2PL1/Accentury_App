import XCTest
@testable import AccenturyCore

/// 대사 카드 캡션 (KAN-161 4단계). 안드로이드 `recording/PromptCaptionTest.kt`의 이식본.
///
/// 아트보드는 "3 / 10 · 이 문장을 읽어주세요"인데, 문항 수를 안 실어 보내는 구버전 웹이 있어
/// (브리지 `VoiceItemStart`) 숫자가 0으로 들어올 수 있다.
///
/// `0 / 0 ·`으로 시작하는 줄은 숫자가 아예 없는 것보다 나쁘다 — 사용자가 자기가 몇 번째인지
/// 잘못 읽는다. 그 갈림을 화면 밖으로 빼서 여기서 고정한다.
final class PromptCaptionTests: XCTestCase {

    func test번호를_알면_진행과_안내를_한_줄로_붙인다() {
        XCTAssertEqual("4 / 7 · 이 문장을 읽어주세요", promptCaption(questionIndex: 4, totalQuestions: 7))
        XCTAssertEqual("1 / 5 · 이 문장을 읽어주세요", promptCaption(questionIndex: 1, totalQuestions: 5))
    }

    func test번호를_모르면_안내만_남긴다_0_슬래시_0을_보여주지_않는다() {
        XCTAssertEqual("이 문장을 읽어주세요", promptCaption(questionIndex: 0, totalQuestions: 0))
        XCTAssertEqual("이 문장을 읽어주세요", promptCaption(questionIndex: 3, totalQuestions: 0))
        XCTAssertEqual("이 문장을 읽어주세요", promptCaption(questionIndex: 0, totalQuestions: 10))
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
