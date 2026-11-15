import XCTest
@testable import AccenturyCore

/// 녹음 버튼 둘레 소리 원 (KAN-355 4단계, 움직임 타일 2). 원이 버튼 안으로 들어가거나 1.35배를 넘으면 안 된다는 AC를 고정한다.
final class SoundRingTests: XCTestCase {

    func test배율_0이면_버튼_테두리_1이면_최대() {
        XCTAssertEqual(1.0, soundRingScale(level: 0), accuracy: 1e-9)
        XCTAssertEqual(1.35, soundRingScale(level: 1), accuracy: 1e-9)
        XCTAssertEqual(1.175, soundRingScale(level: 0.5), accuracy: 1e-9)
    }

    func test배율_범위_밖_값은_끝으로_자른다() {
        XCTAssertEqual(1.0, soundRingScale(level: -0.4), accuracy: 1e-9)
        XCTAssertEqual(1.35, soundRingScale(level: 7), accuracy: 1e-9)
    }

    func test크기_무음_문턱_아래는_0_전체_스케일은_1() {
        XCTAssertEqual(0, soundRingLevel(rms: 0))
        XCTAssertEqual(0, soundRingLevel(rms: AudioQuality.quietRmsThreshold))
        XCTAssertEqual(1, soundRingLevel(rms: AudioQuality.fullScale), accuracy: 1e-9)
        XCTAssertEqual(1, soundRingLevel(rms: AudioQuality.fullScale * 2))
    }

    func test크기_일상_발화는_가운데쯤이고_클수록_커진다() {
        let speech = soundRingLevel(rms: 1_000)
        XCTAssertGreaterThan(speech, 0.3)
        XCTAssertLessThan(speech, 0.6)
        XCTAssertGreaterThan(soundRingLevel(rms: 3_000), speech)
    }
}
