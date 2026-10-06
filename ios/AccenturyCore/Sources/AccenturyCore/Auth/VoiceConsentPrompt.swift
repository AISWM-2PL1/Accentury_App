import Foundation

/// 음성 저장 동의 화면을 이 계정에 이미 띄웠는지 (KAN-270, 팀 결정 2026-10-06). 안드로이드
/// `auth/VoiceConsentPromptStore.kt`의 이식본이다.
///
/// 건너뛴 사용자에게는 다시 띄우지 않고, 켜는 길은 설정 화면 하나다. 그런데 서버에는 "건너뜀" 상태가 없어
/// (미동의와 같다) 로컬에 둔다. 계정 id별로 적는 이유: 한 기기에서 다른 계정으로 로그인하면 그 계정은 아직
/// 묻지 않았다. 재설치로 한 번 더 뜨는 것은 허용한다(팀 결정).
public protocol VoiceConsentPromptStore {
    func wasPrompted(userId: String) -> Bool
    func markPrompted(userId: String)
}

/// `UserDefaults` 구현. 키 `voice_consent_prompt.<사용자 id>`, 값 true — 안드로이드 prefs 파일 `voice_consent_prompt`
/// (키 = 사용자 id)를 ``UserDefaultsAdConsentStore``와 같은 규칙(파일명과 키를 점으로 잇는다)으로 한 키에 옮겼다.
public struct UserDefaultsVoiceConsentPromptStore: VoiceConsentPromptStore {

    public static let keyPrefix = "voice_consent_prompt."

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func wasPrompted(userId: String) -> Bool {
        defaults.bool(forKey: Self.keyPrefix + userId)
    }

    // 버튼 콜백(메인)에서 오는 쓰기다. 되읽기는 메모리 사본에서 즉시 반영된다 — 안드로이드 `apply()`와 같다.
    public func markPrompted(userId: String) {
        defaults.set(true, forKey: Self.keyPrefix + userId)
    }
}

/// 동의 화면을 띄울지 (KAN-270, 안드로이드 `shouldPromptVoiceConsent`와 같은 판정). 로그인과 추가 정보를 마친
/// (``AuthGateState/signedIn(_:voiceConsent:)``) 미동의 계정에, 이 기기에서 아직 묻지 않았을 때만. 동의 상태를
/// 모르면(nil — 로그인 직후 `me()` 실패 등) 띄우지 않는다 — 이미 동의한 사람에게 다시 묻는 것보다 이번에 한 번
/// 안 묻는 쪽이 낫고, 설정 화면에서 켤 수 있다.
public func shouldPromptVoiceConsent(state: AuthGateState, wasPrompted: Bool) -> Bool {
    guard case .signedIn(_, let consent) = state else { return false }
    return consent?.consented == false && !wasPrompted
}
