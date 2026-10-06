import Combine
import Foundation

/// 로그인을 끈 빌드(익명 모드)의 음성 저장 동의 (KAN-270 6단계, 팀 결정 2026-10-06). 안드로이드
/// `auth/AnonymousVoiceConsentStore.kt`의 이식본이다.
///
/// 계정이 없으니 서버에 동의를 둘 자리가 없다 — **설치당 한 번 묻고 기기에 둔다.** 이후 세션(첫 응시·재응시)마다
/// ``anonymousVoiceConsentVersion(consented:)``으로 body의 `voiceConsentVersion`을 정한다. 기본은 미동의다. 재설치로
/// 한 번 더 묻는 것은 계정 모드(``UserDefaultsVoiceConsentPromptStore``)와 같이 허용한다.
///
/// 키 `voice_consent_anonymous.asked`·`voice_consent_anonymous.consented` — 안드로이드 prefs 파일 `voice_consent_anonymous`
/// (키 `asked`·`consented`)를 ``UserDefaultsVoiceConsentPromptStore``와 같은 규칙(파일명과 키를 점으로 잇는다)으로 옮겼다.
/// 값을 `@Published`로도 들고 있어서 ``save(consented:)`` 직후 시작 게이트의 동의 단계가 걷히고 설정 스위치가 따라온다
/// (UserDefaults 읽기만으로는 다시 그리기가 일어나지 않는다 — 안드로이드가 Compose 상태를 함께 드는 것과 같은 이유).
///
/// 설정 스위치도 ``save(consented:)``를 부른다 — 설정에서 바꾼 것도 "물어봤다"로 친다(PR #22 리뷰의 계정 쪽 규칙과 같다).
/// 그래서 시작 전에 설정에서 켠 사람에게 동의 화면이 또 뜨지 않는다.
///
/// 출신 지역(KAN-270 7단계, 키 `voice_consent_anonymous.region`)도 같이 둔다. 익명 세션은 프로필이 없어 서버 라벨이
/// `UNKNOWN`으로 남기 때문에 설치당 한 번 묻는다(``needsAnonymousRegion(region:)``). 동의 여부와 무관하게 모두에게
/// 묻는다 (KAN-274) — 서버가 동의하지 않은 익명 세션도 음성 없이 점수와 지역을 남기기 때문이다.
/// 동의를 껐다 켜도 지역은 지우지 않는다.
@MainActor
public final class AnonymousVoiceConsentStore: ObservableObject {

    public static let askedKey = "voice_consent_anonymous.asked"
    public static let consentedKey = "voice_consent_anonymous.consented"
    public static let regionKey = "voice_consent_anonymous.region"

    private let defaults: UserDefaults
    @Published private var isAsked: Bool
    @Published private var isConsented: Bool
    @Published private var storedRegion: String?

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        isAsked = defaults.bool(forKey: Self.askedKey)
        isConsented = defaults.bool(forKey: Self.consentedKey)
        storedRegion = defaults.string(forKey: Self.regionKey)
    }

    public func asked() -> Bool { isAsked }

    public func consented() -> Bool { isConsented }

    /// 저장된 출신 지역 코드(``Region`` rawValue). 아직 안 골랐으면 nil
    public func region() -> String? { storedRegion }

    /// 동의 화면의 선택과 설정 스위치.
    public func save(consented: Bool) {
        defaults.set(true, forKey: Self.askedKey)
        defaults.set(consented, forKey: Self.consentedKey)
        isAsked = true
        isConsented = consented
    }

    /// 지역 선택 화면의 [다음].
    public func saveRegion(_ code: String) {
        defaults.set(code, forKey: Self.regionKey)
        storedRegion = code
    }
}

/// 익명 세션 생성 body에 실을 동의 버전. 미동의면 nil(키째 빠진다)
public func anonymousVoiceConsentVersion(consented: Bool) -> String? {
    consented ? voiceConsentVersion : nil
}

/// 시작 게이트에 지역 단계를 세울지 (KAN-270 7단계). 아직 안 골랐으면 동의 여부와 무관하게 세운다 (KAN-274) — 서버가
/// 동의하지 않은 익명 세션도 음성 없이 점수와 지역을 남기므로 라벨은 모두에게서 받는다. 세션 생성 body의 `region`도
/// 같은 이유로 저장값을 그대로 싣는다(``AnonymousVoiceConsentStore/region()``).
public func needsAnonymousRegion(region: String?) -> Bool {
    region == nil
}
