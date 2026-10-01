import AccenturyCore
import UIKit

/// ``AccenturyCore/Haptic``을 실제로 떨게 하는 한 자리 (KAN-258, webview-bridge.md §9). 안드로이드
/// `View.performHaptic`의 이식본이다. 브리지(웹 버튼)와 네이티브 SwiftUI 버튼이 같은 함수를 불러
/// 매핑이 하나로 남는다.
///
/// SwiftUI `.sensoryFeedback`이 아니라 UIKit 피드백 생성기인 이유: 그쪽은 iOS 17부터인데 배포 타깃이
/// iOS 16이다. UIKit 생성기는 iOS 10부터 있고 시스템 「햅틱」 설정을 따른다 — 설정을 끈 사용자에게
/// 떨지 않는 판단을 우리가 다시 하지 않는다 (안드로이드가 `FLAG_IGNORE_GLOBAL_SETTING`을 쓰지 않는 것과 같다).
///
/// 매핑:
/// - ``AccenturyCore/Haptic/tap`` → `UIImpactFeedbackGenerator(style: .light)` — 작고 가벼운 요소가
///   맞닿는 느낌이라 버튼 탭과 뜻이 같다 (안드로이드 `VIRTUAL_KEY`)
///   https://developer.apple.com/documentation/uikit/uiimpactfeedbackgenerator
/// - ``AccenturyCore/Haptic/success``·``AccenturyCore/Haptic/error`` → `UINotificationFeedbackGenerator`
///   `.success`·`.error` — 작업의 성공·실패를 알리는 용도 그대로다 (안드로이드 `CONFIRM`·`REJECT`)
///   https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator
///
/// 생성기를 부를 때마다 만들고 `prepare()`를 부르지 않는다. `prepare()`는 Taptic Engine을 잠깐
/// 데워 지연을 줄이는 선택 사항인데(https://developer.apple.com/documentation/uikit/uifeedbackgenerator/prepare()),
/// 탭은 손가락을 뗀 뒤에 울려 데울 "직전"이 없고, 결과 햅틱은 언제 올지 모른다. 몇십 ms 늦어도
/// 이 앱의 버튼·결과 알림에서는 체감 차이가 없어 생성기를 붙들어 두는 상태를 만들지 않는다.
///
/// `init(style:)`은 iOS 17.5에서 `init(style:view:)`로 대체 표시됐지만 배포 타깃(16)에서는 그쪽이 없다.
@MainActor
enum HapticPlayer {

    static func play(_ haptic: Haptic) {
        switch haptic {
        case .tap: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        case .success: UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .error: UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }
}
