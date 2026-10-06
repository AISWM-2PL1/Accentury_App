import XCTest
@testable import AccenturyCore

/// 익명 모드 동의 → 세션 body 버전, 그리고 로컬 저장 (KAN-270 6단계). 안드로이드 `auth/AnonymousVoiceConsentTest.kt`에
/// 저장소 왕복을 더했다(안드로이드는 SharedPreferences라 JVM 단위 테스트 밖이다).
@MainActor
final class AnonymousVoiceConsentTests: XCTestCase {

    private var suiteName = ""
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "AnonymousVoiceConsentTests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    func test동의하면_게시_문안_버전을_싣는다() {
        XCTAssertEqual("2026-10-04", anonymousVoiceConsentVersion(consented: true))
        XCTAssertEqual(voiceConsentVersion, anonymousVoiceConsentVersion(consented: true))
    }

    func test미동의면_nil이다() {
        XCTAssertNil(anonymousVoiceConsentVersion(consented: false))
    }

    func test처음에는_묻지_않았고_미동의다() {
        let store = AnonymousVoiceConsentStore(defaults: defaults)

        XCTAssertFalse(store.asked())
        XCTAssertFalse(store.consented())
    }

    func test저장하면_물어봤다가_서고_값이_남아_다음_실행에도_읽힌다() {
        let store = AnonymousVoiceConsentStore(defaults: defaults)

        store.save(consented: true)
        XCTAssertTrue(store.asked())
        XCTAssertTrue(store.consented())
        XCTAssertTrue(defaults.bool(forKey: "voice_consent_anonymous.asked"))
        XCTAssertTrue(defaults.bool(forKey: "voice_consent_anonymous.consented"))

        // 설정에서 끈 것도 '물어봤다'로 남는다.
        store.save(consented: false)
        let restored = AnonymousVoiceConsentStore(defaults: defaults)
        XCTAssertTrue(restored.asked())
        XCTAssertFalse(restored.consented())
    }
}
