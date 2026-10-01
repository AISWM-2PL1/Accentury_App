import XCTest
@testable import AccenturyCore

/// 안드로이드 `HapticTest`·`RecordingResultHapticTest`의 이식본 (KAN-258).
final class HapticTests: XCTestCase {

    func testTheThreeBridgeStringsEachReadAsAKind() {
        XCTAssertEqual(.tap, Haptic(bridgeValue: "tap"))
        XCTAssertEqual(.success, Haptic(bridgeValue: "success"))
        XCTAssertEqual(.error, Haptic(bridgeValue: "error"))
        // 웹 `HapticType`과 같은 세 값이어야 한다 — 늘리면 웹·안드로이드도 함께 고친다.
        XCTAssertEqual(["tap", "success", "error"], Haptic.allCases.map(\.rawValue))
    }

    func testStringsOutsideTheContractAreNil() {
        // 보정하지 않는다 — 대소문자·공백까지 계약이다.
        for raw in ["", "TAP", "Tap", "vibrate", "success ", " error", "warning"] {
            XCTAssertNil(Haptic(bridgeValue: raw), raw)
        }
    }

    private func review(_ quality: QualityStatus) -> RecordingUiState {
        .review(.init(attemptId: "a_1", durationMs: 3_000, quality: quality, autoStopped: false))
    }

    func testAReviewThatCanProceedIsASuccess() {
        XCTAssertEqual(.success, recordingResultHaptic(review(.normal)))
    }

    func testAReviewThatMustBeRetakenIsAnError() {
        for quality in [QualityStatus.tooShort, .tooQuiet, .clipped] {
            XCTAssertEqual(.error, recordingResultHaptic(review(quality)), "\(quality)")
        }
    }

    func testAFailedRecordingIsAnError() {
        XCTAssertEqual(.error, recordingResultHaptic(.failed(reason: "mic")))
    }

    func testIdleAndRecordingAreNotResults() {
        XCTAssertNil(recordingResultHaptic(.idle))
        XCTAssertNil(recordingResultHaptic(.recording(.init(elapsedMs: 1_000, rms: 0.1))))
    }
}
