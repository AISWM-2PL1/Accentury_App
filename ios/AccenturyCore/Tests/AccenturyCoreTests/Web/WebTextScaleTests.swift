import XCTest
@testable import AccenturyCore

/// 웹 루트 글자 주입 (KAN-332). 안드로이드 `WebTextZoomTest`의 짝이다 — 같은 식·상한 200%.
final class WebTextScaleTests: XCTestCase {

    func testScaleBecomesRootPxCappedAt200Percent() {
        XCTAssertEqual(16, webRootFontPx(scale: 1.0), accuracy: 1e-9)
        XCTAssertEqual(13.12, webRootFontPx(scale: 0.82), accuracy: 1e-9)
        XCTAssertEqual(24, webRootFontPx(scale: 1.5), accuracy: 1e-9)
        XCTAssertEqual(32, webRootFontPx(scale: 2.0), accuracy: 1e-9)
        XCTAssertEqual(32, webRootFontPx(scale: 3.3), accuracy: 1e-9)
    }

    func testScriptSetsRootFontSizeAndDispatchesResize() {
        XCTAssertEqual(
            "document.documentElement.style.fontSize='17.6px';window.dispatchEvent(new Event('resize'));",
            webRootFontScript(px: 17.6)
        )
        XCTAssertEqual(
            "document.documentElement.style.fontSize='32px';window.dispatchEvent(new Event('resize'));",
            webRootFontScript(px: 32)
        )
        // 부동소수 꼬리(0.82 × 16 = 13.120000000000001)는 4자리에서 잘린다
        XCTAssertEqual(
            "document.documentElement.style.fontSize='13.12px';window.dispatchEvent(new Event('resize'));",
            webRootFontScript(px: webRootFontPx(scale: 0.82))
        )
    }
}
