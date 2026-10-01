import Foundation

/// 햅틱 종류 (KAN-258). 브리지 `haptic(type)`이 받는 세 값이자 네이티브 SwiftUI 버튼이 쓰는 값이다
/// (webview-bridge.md §9). 안드로이드 `ui/components/Haptic.kt`의 이식본이고, 웹 `HapticType`·안드로이드
/// allowlist와 같은 세 값이어야 한다 — 하나를 늘리면 셋을 함께 고친다.
///
/// 어떻게 떨지(UIKit 피드백 생성기)는 앱 타깃의 `HapticPlayer`가 정한다. Core는 UIKit을 링크하지 않아
/// (macOS `swift test`) 여기에는 "무엇을"만 둔다.
public enum Haptic: String, CaseIterable, Sendable {

    /// Primary 버튼·녹음 버튼·객관식 선택의 가벼운 탭
    case tap

    /// 녹음이 다음으로 넘어갈 수 있는 품질로 끝났다
    case success

    /// 녹음이 실패했거나 다시 녹음해야 하는 품질로 끝났다
    case error

    /// 브리지 문자열을 종류로 읽는다. 계약 밖 문자열은 nil — 브리지가 조용히 버리고 Crashlytics 흔적만
    /// 남기는 규칙(§5)의 판정 근거다. ``AdConsent/init(bridgeValue:)``와 같은 이유로 대소문자·공백을
    /// 보정하지 않는다: 보정을 시작하면 웹과 앱이 다른 계약을 들고도 "동작하는" 상태가 생긴다.
    public init?(bridgeValue: String) {
        self.init(rawValue: bridgeValue)
    }
}
