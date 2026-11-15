import XCTest
@testable import Accentury

/// 버튼 변형별 색과 토큰 값 (KAN-355 1단계). 화면에서는 "버튼이 조금 다르게 생겼다"로만 드러나는 값이라 여기서 고정한다.
final class ButtonAppearanceTests: XCTestCase {

    /// 주 버튼은 벽돌 면·크림 글자·종이 그림자다.
    func testPrimaryIsBrickWithShadow() {
        let look = ButtonVariant.primary.appearance(enabled: true)
        XCTAssertEqual(Papercut.point, look.face)
        XCTAssertEqual(Papercut.cream, look.label)
        XCTAssertEqual(Papercut.borderHairline, look.borderWidth)
        XCTAssertTrue(look.castsShadow)
    }

    /// 보조 버튼은 크림 면·잉크 1 테두리, 그림자 없음.
    func testSecondaryIsCreamWithInkHairline() {
        let look = ButtonVariant.secondary.appearance(enabled: true)
        XCTAssertEqual(Papercut.cream, look.face)
        XCTAssertEqual(Papercut.ink, look.border)
        XCTAssertEqual(1, look.borderWidth)
        XCTAssertFalse(look.castsShadow)
    }

    /// 위험한 확인 버튼은 벽돌 외곽선이다 — 크림 면·벽돌 1.5 테두리·벽돌 글자 (2026-11-16 결정).
    func testDestructiveIsBrickOutline() {
        let look = ButtonVariant.destructive.appearance(enabled: true)
        XCTAssertEqual(Papercut.cream, look.face)
        XCTAssertEqual(Papercut.point, look.border)
        XCTAssertEqual(1.5, look.borderWidth)
        XCTAssertEqual(Papercut.point, look.label)
        XCTAssertFalse(look.castsShadow)
    }

    /// 글자 버튼은 흐린 잉크 글자뿐이다.
    func testTextIsMutedLabelOnly() {
        let look = ButtonVariant.text.appearance(enabled: true)
        XCTAssertEqual(Papercut.muted, look.label)
        XCTAssertEqual(0, look.borderWidth)
        XCTAssertFalse(look.castsShadow)
    }

    /// 면이 있는 세 변형의 비활성은 같은 모양이다 — 종이 그림자 면·흐린 잉크 글자·테두리, 그림자 없음.
    func testDisabledFilledVariantsShareShadowFace() {
        for variant in [ButtonVariant.primary, .secondary, .destructive] {
            let look = variant.appearance(enabled: false)
            XCTAssertEqual(Papercut.paperShadow, look.face, "\(variant)")
            XCTAssertEqual(Papercut.muted, look.label, "\(variant)")
            XCTAssertEqual(Papercut.muted, look.border, "\(variant)")
            XCTAssertFalse(look.castsShadow, "\(variant)")
        }
    }

    /// 정본 `design-tokens.md`와 같은 값 — 버튼 높이 48, 라벨 Jua 17/16, 시트 반경 16, 리빌 600ms.
    func testTokensMatchCanon() {
        XCTAssertEqual(48, Papercut.controlHeightLarge)
        XCTAssertEqual(17, Papercut.TextStyle.button.size)
        XCTAssertEqual(16, Papercut.TextStyle.textButton.size)
        XCTAssertTrue(Papercut.TextStyle.button.usesJua)
        XCTAssertTrue(Papercut.TextStyle.textButton.usesJua)
        XCTAssertEqual(16, Papercut.radiusSheet)
        XCTAssertEqual(0.6, Papercut.Motion.reveal)
        XCTAssertEqual(320, Papercut.dialogWidth)
    }
}
