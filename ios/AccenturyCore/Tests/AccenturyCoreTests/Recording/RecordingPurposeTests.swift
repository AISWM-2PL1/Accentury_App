import XCTest
@testable import AccenturyCore

/// 녹음 화면의 두 쓰임 (KAN-253). 안드로이드 `recording/RecordingPurposeTest.kt`의 이식본 — 레벨테스트 모양은 KAN-253 전과 같아야 한다.
final class RecordingPurposeTests: XCTestCase {

    func test레벨테스트에는_내_녹음_듣기가_없다() {
        let purpose = RecordingPurpose.levelTest(itemNumber: 2, totalItems: 7)
        XCTAssertFalse(purpose.offersPlayback)
    }

    func test억양_학습에는_내_녹음_듣기가_있다() {
        let purpose = RecordingPurpose.intonationLearning(standard: nil, itemNumber: 1, totalItems: 5)
        XCTAssertTrue(purpose.offersPlayback)
    }
}
