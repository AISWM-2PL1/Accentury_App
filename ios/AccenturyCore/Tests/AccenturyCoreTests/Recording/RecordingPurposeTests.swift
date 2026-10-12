import XCTest
@testable import AccenturyCore

/// 녹음 화면의 두 쓰임 (KAN-253). 안드로이드 `recording/RecordingPurposeTest.kt`의 이식본 — 레벨테스트 모양은 KAN-253 전과 같아야 한다.
final class RecordingPurposeTests: XCTestCase {

    func test레벨테스트는_진행_표기가_있고_내_녹음_듣기는_없다() {
        let purpose = RecordingPurpose.levelTest(itemNumber: 2, totalItems: 7)
        XCTAssertTrue(purpose.showsProgress)
        XCTAssertFalse(purpose.offersPlayback)
    }

    func test억양_학습도_진행_표기가_있고_내_녹음_듣기가_있다() {
        // 5단계: 녹음 대기 화면이 A-2 카드 역할이라 n/N을 그린다
        let purpose = RecordingPurpose.intonationLearning(standard: nil, itemNumber: 1, totalItems: 5)
        XCTAssertTrue(purpose.showsProgress)
        XCTAssertTrue(purpose.offersPlayback)
    }
}
