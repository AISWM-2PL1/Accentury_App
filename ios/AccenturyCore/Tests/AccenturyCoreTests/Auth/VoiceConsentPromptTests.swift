import XCTest
@testable import AccenturyCore

/// 안드로이드 `auth/VoiceConsentPromptTest.kt`의 이식본 (KAN-270). 같은 다섯 경우를 겨눈다.
final class VoiceConsentPromptTests: XCTestCase {

    private let user = AuthUser(id: "u-1", provider: .GOOGLE)
    private let notConsented = VoiceConsent(consented: false, currentVersion: "2026-10-04")
    private let consented = VoiceConsent(consented: true, version: "2026-10-04", consentedAt: "2026-10-06T01:02:03Z", currentVersion: "2026-10-04")

    func test미동의이고_아직_묻지_않았으면_띄운다() {
        XCTAssertTrue(shouldPromptVoiceConsent(state: .signedIn(user, voiceConsent: notConsented), wasPrompted: false))
    }

    func test이미_물었으면_건너뛴_사용자라도_다시_띄우지_않는다() {
        XCTAssertFalse(shouldPromptVoiceConsent(state: .signedIn(user, voiceConsent: notConsented), wasPrompted: true))
    }

    func test동의한_계정에는_띄우지_않는다() {
        XCTAssertFalse(shouldPromptVoiceConsent(state: .signedIn(user, voiceConsent: consented), wasPrompted: false))
    }

    func test동의_상태를_모르면_띄우지_않는다() {
        XCTAssertFalse(shouldPromptVoiceConsent(state: .signedIn(user, voiceConsent: nil), wasPrompted: false))
    }

    func test로그인과_추가_정보를_마치기_전에는_띄우지_않는다() {
        XCTAssertFalse(shouldPromptVoiceConsent(state: .needsProfile(user, error: nil), wasPrompted: false))
        XCTAssertFalse(shouldPromptVoiceConsent(state: .signedOut(nil), wasPrompted: false))
    }

    // 계정 id별 기록 — 한 기기의 다른 계정은 아직 묻지 않았다. 격리된 도메인을 쓴다(AdConsentStore 테스트와 같다).
    func test표시_기록은_계정마다_따로다() throws {
        let suite = "VoiceConsentPromptTests"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsVoiceConsentPromptStore(defaults: defaults)

        store.markPrompted(userId: "u-1")

        XCTAssertTrue(store.wasPrompted(userId: "u-1"))
        XCTAssertFalse(store.wasPrompted(userId: "u-2"))
        XCTAssertTrue(defaults.bool(forKey: "voice_consent_prompt.u-1"))
    }
}
