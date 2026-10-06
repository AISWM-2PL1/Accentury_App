import AccenturyCore
import Foundation

/// 인증 객체들의 프로세스 단위 자리 (KAN-224). 안드로이드 `AccenturyApplication`의 `authClients`·`authGate` 자리다.
///
/// 앱에 하나만 있어야 한다 — 둘이면 Refresh 회전을 줄 세우는 관문(``AccenturyCore/TokenRefresher``)이 둘이 되어
/// 동시 갱신이 서로의 Refresh를 죽인다. 화면(`@StateObject`)이 아니라 여기 두는 이유는 광고 허브와 같다: 로그인
/// 상태는 화면 하나의 것이 아니고, 세션 생성(``TestFlowModel``)도 같은 저장소·같은 관문을 봐야 한다.
enum AuthHub {

    /// 저장소·갱신 관문·인증 API. `nonisolated`로 읽히는 값이라 세션 클라이언트를 만드는 기본 인자에서도 쓴다.
    static let clients = AuthClients(baseURL: AppConfig.apiBaseURL, store: KeychainTokenStore())

    /// 로그인 상태 머신. 시작 확인(bootstrap)은 프로세스당 한 번 ``AccenturyApp``의 이니셜라이저가 건다.
    ///
    /// 로그인을 끈 빌드(익명 모드, KAN-270 6단계)에서는 두 값 모두 깨어나지 않는다 — 읽는 곳이 전부
    /// `AppConfig.loginEnabled` 분기 안쪽이다(``AccenturyApp``, ``ContentView``, ``TestFlowModel``의 기본 인자).
    @MainActor static let gate = AuthGateController(api: clients.api, store: clients.store, refresher: clients.refresher)
}
